import { Songs } from "./db/tmp-db-conf.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import albumArt from "album-art";
import * as mm from "music-metadata";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ffmpeg = require("fluent-ffmpeg");
import { spawn } from 'child_process';
import { Queue } from "./db/queue-db.conf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const { givenPath, icecastserver, silenceArgs: silenceArgsBase } = config;

// Build silenceArgs with dynamic icecast URL
const icecastUrl = `icecast://${encodeURIComponent(icecastserver.ICECAST_USER)}:${encodeURIComponent(icecastserver.ICECAST_PASSWORD)}@${icecastserver.ICECAST_HOST}:${icecastserver.ICECAST_PORT}${icecastserver.ICECAST_MOUNT}`;
const silenceArgs = [...silenceArgsBase, icecastUrl];
const silenceArgsWithIce = [...silenceArgsBase,
  '-ice_url',
  `https://${icecastserver.ICECAST_HOST}/Mekkify/mekkify_defo.jpg`,
  icecastUrl
];

// Set path of ffmpeg 
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

//define global ffmpeg instances
let flacStreamProcess = null;
let silenceStreamProcess = null;  

//refreshdb function
let repopulateDB = async () => {
  let flacArray = await listFilesRecursively(givenPath);
  for (let flacfile of flacArray) {
    try {
      let metadata = await mm.parseFile(flacfile);
      await Songs.create({
        title: metadata.common.title || 'Unknown Title',
        artists: metadata.common.artist || 'Unknown Artist',
        album: metadata.common.album || 'Unknown Album',
        path: flacfile
      });
    } catch (err) {
      console.error("Error processing file:", err);
    }
  }
  return 1;
}

function hasEmbeddedArt(filePath) {
  return new Promise((resolve) => {
    const ff = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_streams',
      '-select_streams', 'v',
      filePath
    ]);

    let output = '';
    ff.stdout.on('data', (data) => output += data);
    ff.on('close', () => resolve(output.trim().length > 0));
  });
}

async function downloadRemoteImage(url, outputPath) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.promises.writeFile(outputPath, Buffer.from(arrayBuffer));
    return true;
  } catch (error) {
    console.error(`Error downloading remote art from ${url}:`, error);
    return false;
  }
}

async function extractCoverArt(filePath) {
  try {
    const hasArt = await hasEmbeddedArt(filePath);
    const outputPath = path.join(__dirname, 'cover.jpg');

    if (hasArt) {
      return new Promise((resolve) => {
        const ff = spawn('ffmpeg', [
          '-y',           // overwrite
          '-i', filePath,
          '-an',          // no audio
          '-vcodec', 'copy',
          outputPath
        ]);
        ff.on('close', (code) => resolve(code === 0));
      });
    }

    console.log(`No embedded art found in ${filePath}, fetching album art...`);
    const metadata = await mm.parseFile(filePath);
    const album = metadata.common.album || '';
    const artist = metadata.common.artist || '';
    const albumArtUrl = await getAlbumJpg(album, artist);

    if (!albumArtUrl) {
      console.warn(`No album art URL available for ${artist} - ${album}`);
      return false;
    }

    return await downloadRemoteImage(albumArtUrl, outputPath);
  } catch (err) {
    console.error(`Error extracting cover art from ${filePath}:`, err);
    return false;
  }
}

//listDB function
let listDB = async () => {
  let songs = await Songs.findAll();
  return songs;
}

//grotesque function to stream with ffmpeg
async function streamFlacFile(filePath, metadata) {
  const meta = {
    title:  metadata.title  || path.basename(filePath),
    artist: metadata.artist || 'Unknown Artist',
    album:  metadata.album  || 'Unknown Album',
  };
  await extractCoverArt(filePath);
  if (silenceStreamProcess) {
    console.log('Stopping existing stream...');
    await silenceStreamProcess.kill('SIGTERM'); 
    silenceStreamProcess = null;
  }
  if (flacStreamProcess) {
    console.log('Stopping existing stream...');
    await flacStreamProcess.kill('SIGTERM'); 
    flacStreamProcess = null;
  }
   
//FFMPEG ARGS
const ffmpegArgs = [
  '-re',              // Read input at native frame rate
  '-i', filePath,     // Input FLAC file or stream
  '-c:a', 'libvorbis', // Use the Vorbis encoder
  '-b:a', '192k',     // Set audio bitrate to 192 kbps for good quality
  '-ar', '44100',     // Set audio sample rate to 44.1 kHz
  '-ac', '2',         // Ensure stereo audio
  // Pass text metadata to Icecast
    '-ice_name',        meta.title,
    '-ice_description', `${meta.album}`,
    '-ice_url',         `https://${icecastserver.ICECAST_HOST}/Mekkify/cover.jpg`, // art URL for players
  '-content_type', 'audio/ogg', // Set content type to OGG
  '-vn',              // Disable video
  '-f', 'ogg',        // Use OGG format
  `icecast://${encodeURIComponent(icecastserver.ICECAST_USER)}:${encodeURIComponent(icecastserver.ICECAST_PASSWORD)}@${icecastserver.ICECAST_HOST}:${icecastserver.ICECAST_PORT}${icecastserver.ICECAST_MOUNT}`
];

  console.log(`Streaming file: ${filePath}`);
 
  return new Promise((resolve, reject) => {
    flacStreamProcess = spawn('ffmpeg', ffmpegArgs);

    flacStreamProcess.stderr.on('data', (data) => {
      console.error(`FFmpeg stderr: ${data}`);
    });

    flacStreamProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      if (code === 0) {
        startSilenceProcess();
      }
      resolve(); 
    });

    flacStreamProcess.on('error', (err) => {
      console.error(`FFmpeg process error: ${err}`);
      reject(err); 
    });
  });
}
//recursive file read
function listFilesRecursively(dirPath) {
  let fileList = [];

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      fileList = fileList.concat(listFilesRecursively(itemPath));
    } else if (stat.isFile() && path.extname(itemPath).toLowerCase() === '.flac') {
      fileList.push(itemPath);
    }
  }

  return fileList;
}

//grotesque function to silence with ffmpeg
async function startSilenceProcess() {
  if (silenceStreamProcess) {
    console.log('Stopping existing stream...');
    await silenceStreamProcess.kill('SIGTERM'); 
    silenceStreamProcess = null;
  }
  if (flacStreamProcess) {
    console.log('Stopping existing stream...');
    await flacStreamProcess.kill('SIGTERM'); 
    flacStreamProcess = null;
  }

  const voidSoundEntity = spawn('ffmpeg', silenceArgsWithIce);

  voidSoundEntity.stderr.on('data', (data) => {
    console.error(`FFmpeg stderr (silence): ${data}`);
  });

  voidSoundEntity.on('close', (code) => {
    console.log(`FFmpeg process (silence) exited with code ${code}`);
  });

  voidSoundEntity.on('error', (err) => {
    console.error(`FFmpeg process (silence) error: ${err}`);
  });

  silenceStreamProcess = voidSoundEntity; 
}

async function getAlbumJpg(albumName, artistsName) {
  let url = await albumArt( artistsName, {album: albumName, size: 'medium'} );
  console.log(`Fetched album art URL for ${albumName} by ${artistsName}: ${url}`);
  return url;
}

export { repopulateDB, listDB, streamFlacFile, startSilenceProcess, getAlbumJpg };
