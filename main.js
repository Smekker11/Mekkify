import { repopulateDB, listDB, streamFlacFile, startSilenceProcess } from './methods.js';
import { Songs } from './db/tmp-db-conf.js';
import { Queue } from './db/queue-db.conf.js';
import cors from 'cors';
import express from 'express';


import { apiport, givenPath, icecastserver } from './config.js';
import { json } from 'sequelize';

const app = express();
app.use(cors());

startSilenceProcess(); // Radio silence defaulted

app.get('/stream/:id', async (req, res) => {
    const songId = req.params.id; 
    console.log('songId:', songId);
    try {
        const song = await Songs.findByPk(songId);
        if (song) {
            console.log(`Streaming file: ${song.path}`);
            streamFlacFile(song.path); 
            res.send(`Streaming file: ${song.path}`);
        } else {
            res.status(404).send('Song not found, silence continues...');
        }
    } catch (err) {
        res.status(500).send('Error streaming file: ' + err.message);
    }
});

// Refresh DB
app.get('/refresh', async (req, res) => {
    const result = await repopulateDB();
    if (result === 1) {
        res.send('FLAC DATABASE REFRESHED WITH PATH: ' + givenPath);
    } else {
        res.status(500).send("Catastrophic failure! " + JSON.stringify(result));
    }
});

app.get('/list', async (req, res) => {
    const songs = await listDB();
    res.send(songs);
});

//QUEUE SECTION

//list queue
app.get('/list/queue', async (req, res) => {
    const queue = await Queue.findAll();
    res.send('Queue dump: ' + JSON.stringify(queue));
});

app.get('/queue/add/:id', async (req, res) => {
    const songId = req.params.id; 
    console.log('searching for song by ID:', songId);
    try {
        const song = await Songs.findByPk(songId);
        if (song) {
            console.log(`Adding file to queue: ${songId}`);
            await Queue.create({
                path: song.path,
                songID: songId,
            });
            res.send('Added file to queue: ' + songId);
        } else {
            res.status(404).send('Song ID not found in DB');
        }
} catch (err) {
        res.status(500).send('Error adding file to queue: ' + err.message);
    }
}
);

//toggle queue
app.get('/queue/:status', async (req, res) => {
    if (req.params.status === 'true') {
        const queue = await Queue.findAll();
        if (queue.length === 0) {
            res.status(404).send('Queue is empty.');
            return;
        }

        const playQueue = async (index) => {
            if (index >= queue.length) {
                console.log('End of queue reached.');
                startSilenceProcess(); 
                return;
            }

            const song = queue[index];
            if (song.path) {
                console.log(`Queue song id: ${song.songID}, path: ${song.path}`);
                await streamFlacFile(song.path); 
                playQueue(index + 1); 
            } else {
                console.error(`Invalid song path for song ID: ${song.songID}`);
                playQueue(index + 1); 
            }
        };

        playQueue(0);
        res.send('Queue started.');
    } else if (req.params.status === 'false') {
        startSilenceProcess();
        res.send('Queue stopped.');
    } else {
        res.status(400).send('Invalid status. Use "true" or "false".');
    }
});

// Drop queue
app.get('/drop/queue', async (req, res) => {
    try {
        await Queue.destroy({ where: {} }); // Delete all entries in the Queue table
        await startSilenceProcess()
        await startSilenceProcess()
        res.send('Queue dropped successfully.');
    } catch (err) {
        res.status(500).send('Error dropping queue: ' + err.message);
    }
});

//init API
app.listen(apiport, () => {
    console.log(`Icecast Source API running on port ${apiport}`);
});