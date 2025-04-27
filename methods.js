import { Songs } from "./db/tmp-db-conf.js";
import { givenPath, icecastserver, ffmpegArgs,silenceArgs } from "./config.js";
import fs from "fs";
import path from "path";
import * as mm from "music-metadata";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ffmpeg = require("fluent-ffmpeg");
import { spawn } from 'child_process';

// Set the path to the ffmpeg binary
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

let flacStreamProcess = null;
let silenceStreamProcess = null; // Global variable to store silence process  

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

let listDB = async () => {
  let songs = await Songs.findAll();
  return songs;
}

async function streamFlacFile(filePath) {
  if (silenceStreamProcess) {
    console.log('Stopping existing stream...');
    silenceStreamProcess.kill('SIGTERM'); // Stop the current stream
    silenceStreamProcess = null;
  }
  if (flacStreamProcess) {
    console.log('Stopping existing stream...');
    flacStreamProcess.kill('SIGTERM'); // Stop the current stream
    flacStreamProcess = null;
  }

  console.log(`Streaming file: ${filePath}`);

  flacStreamProcess = spawn('ffmpeg', ffmpegArgs);

  flacStreamProcess.stderr.on('data', (data) => {
    console.error(`FFmpeg stderr: ${data}`);
  });

  flacStreamProcess.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
    if (code == 0) {
      startSilenceProcess(); // Restart silence stream if ffmpeg exits cleanly
    }
  });

  flacStreamProcess.on('error', (err) => {
    console.error(`FFmpeg process error: ${err}`);
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


function startSilenceProcess() {
  if (silenceStreamProcess) {
    console.log('Stopping existing stream...');
    silenceStreamProcess.kill('SIGTERM'); // Stop the current stream
    silenceStreamProcessStreamProcess = null;
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

  silenceStreamProcess = voidSoundEntity; // Store the silence process globally
}

export { repopulateDB, listDB, streamFlacFile, startSilenceProcess };
