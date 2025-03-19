import { Songs } from "./db/tmp-db-conf.js";
import { givenPath, icecastserver } from "./config.js";
import fs from "fs";
import path from "path";
import * as mm from "music-metadata";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ffmpeg = require("fluent-ffmpeg");
import icecast from 'icecast';

// Set the path to the ffmpeg binary
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

let repopulateDB = async () => {
  let flacArray = await listFilesRecursively(givenPath);
  for (let flacfile of flacArray) {
    try {
      let metadata = await mm.parseFile(flacfile); // Await the parseFile function
      await Songs.create({
        title: metadata.common.title || 'Unknown Title',
        artists: metadata.common.artist || 'Unknown Artist',
        album: metadata.common.album || 'Unknown Album',
        path: flacfile
      });
    } catch (err) {
      return err;
    }
  }
  return 1;
}

let listDB = async () => {
  let songs = await Songs.findAll();
  return songs;
}

async function streamFlacFile(filePath) {
  let playerobj = await createPlayer();
  console.log('Now Playing:', filePath);

  if (playerobj) {
    await console.log('Connecting to Icecast server... ' + JSON.stringify(playerobj));
    playerobj.on('connect', () => {
      console.log('Connected to Icecast server');
      const ffmpegStream = ffmpeg(filePath)
      .inputFormat('flac')
      .format('flac')
      .pipe(playerobj, { end: true });

      ffmpegStream.on('error', (err) => {
      console.error('FFmpeg error:', err);
    });
    });

    playerobj.on('error', (err) => {
      console.error('Icecast client error:', err);
    });
  } else {
    console.error("Player is not initialized.");
  }
}

function listFilesRecursively(dirPath) {
  let fileList = [];

  // Read the contents of the directory
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      // If the item is a directory, recursively list its contents
      fileList = fileList.concat(listFilesRecursively(itemPath));
    } else if (stat.isFile() && path.extname(itemPath).toLowerCase() === '.flac') {
      // If the item is a file and has a .flac extension, add it to the list
      fileList.push(itemPath);
    }
  }

  return fileList;
}

async function createPlayer() {
  let player;
try {
  player = new icecast.Client({
    host: icecastserver.ICECAST_HOST,
    port: icecastserver.ICECAST_PORT,
    user: icecastserver.ICECAST_USER,
    password: icecastserver.ICECAST_PASSWORD,
    mount: icecastserver.ICECAST_MOUNT
  });

  player.on('error', (err) => {
    console.error('Icecast client connection error:', err);
  });
} catch (err) {
  //console.log(player.host + " " + player.port + " " + player.user + " " + player.password + " " + player.mount);
  console.error("Error creating Icecast client:", err, " ", JSON.stringify(player));
}
  return player;
}

export { repopulateDB, listDB, streamFlacFile };
