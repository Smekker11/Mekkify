import { repopulateDB, listDB, streamFlacFile } from './methods.js';
import { Songs } from './db/tmp-db-conf.js';
import cors from 'cors';
import express from 'express';

// Icecast server details
import { apiport, givenPath } from './config.js';

const app = express();
app.use(cors());


app.get('/stream/:id', async (req, res) => {
    const songId = req.params.id; console.log('songId:', songId);
    try {
        const song = await Songs.findByPk(songId);
        if (song) {
            console.log(`Streaming file: ${song.path}`);
            await streamFlacFile(song.path);
            res.send(`Streaming file: ${song.path}`);
        } else {
            res.status(404).send('Song not found');
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

app.get('/list', async (req, res) => {
    // List all songs in the database
    const songs = await listDB();
    res.send(songs);
});


app.listen(apiport, () => {
    console.log(`Icecast Source API running on port ${apiport}`);
});