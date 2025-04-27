import { repopulateDB, listDB, streamFlacFile, startSilenceProcess } from './methods.js';
import { Songs } from './db/tmp-db-conf.js';
import { Queue } from './db/queue-db.conf.js';
import cors from 'cors';
import express from 'express';


import { apiport, givenPath, icecastserver } from './config.js';

const app = express();
app.use(cors());

startSilenceProcess(); // Start streaming silence by default

app.get('/stream/:id', async (req, res) => {
    const songId = req.params.id; 
    console.log('songId:', songId);
    try {
        const song = await Songs.findByPk(songId);
        if (song) {
            console.log(`Streaming file: ${song.path}`);
            streamFlacFile(song.path); // Stream the selected file
            res.send(`Streaming file: ${song.path}`);
        } else {
            res.status(404).send('Song not found, silence continues...');
        }
    } catch (err) {
        res.status(500).send('Error streaming file: ' + err.message);
    }
});

// Read FLAC files from directory and stream them
app.get('/refresh', async (req, res) => {
    // Repopulate the database with FLAC files
    const result = await repopulateDB();
    if (result === 1) {
        res.send('FLAC DATABASE REFRESHED WITH PATH: ' + givenPath);
    } else {
        res.send("Catastrophic failure! " + JSON.stringify(result));
    }
});

app.get('/list/queue', async (req, res) => {
    // List all songs in the queue
    const queue = await Queue.findAll();
    res.send('Current position in queue: ' + queuePOS + '\n' +  ' Queue: ' + JSON.stringify(queue));
});

app.get('/list', async (req, res) => {
    // List all songs in the database
    const songs = await listDB();
    res.send(songs);
});

export let queuePOS = 1;

app.listen(apiport, () => {
    console.log(`Icecast Source API running on port ${apiport}`);
});