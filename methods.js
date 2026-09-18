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
const { givenPath, apiBaseUrl, icecastserver, silenceArgs: silenceArgsBase } = config;

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
let streamGeneration = 0;
let skipRequestGeneration = 0;
let sourceTransition = Promise.resolve();

function stopProcess(process, label) {
  if (!process || process.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    process.once('close', finish);
    process.once('error', finish);
    process.kill('SIGTERM');
    setTimeout(finish, 2000);
    console.log(`Stopping existing ${label} process...`);
  });
}

async function stopCurrentProcesses() {
  sourceTransition = sourceTransition.then(async () => {
    if (silenceStreamProcess) {
      const processToStop = silenceStreamProcess;
      silenceStreamProcess = null;
      await stopProcess(processToStop, 'silence');
    }
    if (flacStreamProcess) {
      const processToStop = flacStreamProcess;
      flacStreamProcess = null;
      await stopProcess(processToStop, 'song');
    }
  });

  await sourceTransition;
}

async function stopCurrentSong() {
  skipRequestGeneration = streamGeneration;
  sourceTransition = sourceTransition.then(async () => {
    if (flacStreamProcess) {
      const processToStop = flacStreamProcess;
      flacStreamProcess = null;
      await stopProcess(processToStop, 'song');
    }
  });

  await sourceTransition;
}

function getPrimaryArtist(metadata) {
  const artist = metadata.common.artists?.[0] || metadata.common.artist || 'Unknown Artist';
  return artist
    .split(/\s*(?:feat(?:uring)?|ft)\s*\.?\s*:?\s+|[;,&]/i)[0]
    .trim() || 'Unknown Artist';
}

//refreshdb function
let repopulateDB = async () => {
  let flacArray = await listFilesRecursively(givenPath);
  for (let flacfile of flacArray) {
    try {
      let metadata = await mm.parseFile(flacfile);
      await Songs.create({
        title: metadata.common.title || 'Unknown Title',
        artists: getPrimaryArtist(metadata),
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
async function streamFlacFile(filePath, metadata, options = {}) {
  const { startSilenceOnClose = true } = options;
  const generation = ++streamGeneration;
  const meta = {
    title:  metadata.title  || path.basename(filePath),
    artist: metadata.artist || 'Unknown Artist',
    album:  metadata.album  || 'Unknown Album',
  };
  await extractCoverArt(filePath);
  if (generation <= skipRequestGeneration) return;
  await stopCurrentProcesses();
   
//FFMPEG ARGS
const ffmpegArgs = [
  '-re',              // Read input at native frame rate
  '-i', filePath,     // Input FLAC file or stream
  '-c:a', 'libvorbis', // Use the Vorbis encoder
  '-b:a', '192k',     // Set audio bitrate to 192 kbps for good quality
    '-af', 'loudnorm=I=-16:LRA=11:TP=-1.5', // Normalize program loudness and limit peaks
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
    const currentProcess = flacStreamProcess;

    flacStreamProcess.stderr.on('data', (data) => {
      console.error(`FFmpeg stderr: ${data}`);
    });

    flacStreamProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      if (code === 0 && startSilenceOnClose && generation === streamGeneration && flacStreamProcess === currentProcess) {
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
  await stopCurrentProcesses();

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
  try {
    const artworkRequest = albumArt(artistsName, { album: albumName, size: 'medium' });
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
    const url = await Promise.race([artworkRequest, timeout]);
    console.log(`Fetched album art URL for ${albumName} by ${artistsName}: ${url}`);
    return url;
  } catch (error) {
    console.error(`Failed to fetch album art for ${albumName} by ${artistsName}:`, error);
    return null;
  }
}

function hasLocalAlbumCover(songPath) {
  if (!songPath) return false;

  try {
    const albumDirectory = path.dirname(songPath);
    return fs.readdirSync(albumDirectory).some((fileName) => {
      return /^cover\.(jpg|jpeg|png)$/i.test(fileName);
    });
  } catch (error) {
    console.error(`Failed to inspect local cover for ${songPath}:`, error);
    return false;
  }
}

function getLocalAlbumCoverPath(songPath) {
  if (!songPath) return null;

  try {
    const albumDirectory = path.dirname(songPath);
    const coverFile = fs.readdirSync(albumDirectory).find((fileName) => {
      return /^cover\.(jpg|jpeg|png)$/i.test(fileName);
    });

    return coverFile ? path.resolve(albumDirectory, coverFile) : null;
  } catch (error) {
    console.error(`Failed to resolve local cover for ${songPath}:`, error);
    return null;
  }
}

async function getOptimizedAlbumCoverPath(songPath) {
  const coverPath = getLocalAlbumCoverPath(songPath);
  if (!coverPath) return null;

  const thumbnailPath = path.resolve(path.dirname(coverPath), 'cover-thumb.jpg');
  try {
    const sourceStats = await fs.promises.stat(coverPath);
    const thumbnailStats = await fs.promises.stat(thumbnailPath).catch(() => null);
    if (thumbnailStats && thumbnailStats.mtimeMs >= sourceStats.mtimeMs) {
      return thumbnailPath;
    }

    await new Promise((resolve, reject) => {
      ffmpeg(coverPath)
        .outputOptions([
          '-y',
          '-vf', 'scale=300:300:force_original_aspect_ratio=decrease',
          '-q:v', '5',
          '-frames:v', '1'
        ])
        .output(thumbnailPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    return thumbnailPath;
  } catch (error) {
    console.error(`Failed to optimize local cover for ${songPath}:`, error);
    return fs.existsSync(coverPath) ? coverPath : null;
  }
}

async function getAlbumCover(albumName, artistsName, songPath) {
  const localCoverPath = getLocalAlbumCoverPath(songPath);
  if (localCoverPath) {
    return `album-cover?album=${encodeURIComponent(albumName)}`;
  }

  const artworkUrl = await getAlbumJpg(albumName, artistsName);
  if (!artworkUrl || !songPath || hasLocalAlbumCover(songPath)) return artworkUrl;

  const coverPath = path.join(path.dirname(songPath), 'cover.jpg');
  downloadRemoteImage(artworkUrl, coverPath).catch((error) => {
    console.error(`Failed to cache album artwork for ${albumName}:`, error);
  });
  return artworkUrl;
}

export { repopulateDB, listDB, streamFlacFile, startSilenceProcess, stopCurrentSong, getAlbumJpg, getAlbumCover, getLocalAlbumCoverPath, getOptimizedAlbumCoverPath };
