import { Songs } from "./db/tmp-db-conf.js";
import { givenPath, icecastserver,silenceArgs } from "./config.js";
import fs from "fs";
import path from "path";
import * as mm from "music-metadata";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ffmpeg = require("fluent-ffmpeg");
import { spawn } from 'child_process';
import { Queue } from "./db/queue-db.conf.js";

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

//listDB function
let listDB = async () => {
  let songs = await Songs.findAll();
  return songs;
}

//grotesque function to stream with ffmpeg
async function streamFlacFile(filePath) {
  if (silenceStreamProcess) {
    console.log('Stopping existing stream...');
    silenceStreamProcess.kill('SIGTERM'); 
    silenceStreamProcess = null;
  }
  if (flacStreamProcess) {
    console.log('Stopping existing stream...');
    flacStreamProcess.kill('SIGTERM'); 
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
function startSilenceProcess() {
  if (silenceStreamProcess) {
    console.log('Stopping existing stream...');
    silenceStreamProcess.kill('SIGTERM'); 
    silenceStreamProcess = null;
  }
  if (flacStreamProcess) {
    console.log('Stopping existing stream...');
    flacStreamProcess.kill('SIGTERM'); 
    flacStreamProcess = null;
  }

  const voidSoundEntity = spawn('ffmpeg', silenceArgs);

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

export { repopulateDB, listDB, streamFlacFile, startSilenceProcess };
