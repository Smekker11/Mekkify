import { repopulateDB, listDB, streamFlacFile, startSilenceProcess, getAlbumJpg } from './methods.js';
import { Songs } from './db/tmp-db-conf.js';
import { Queue } from './db/queue-db.conf.js';
import { sequelize } from './db/tmp-db-conf.js';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const { apiport, givenPath, icecastserver, apiBaseUrl, icecastFrontend, phpConfig } = config;
import { json } from 'sequelize';
import { get } from 'http';

const app = express();
app.use(cors());

startSilenceProcess(); // Radio silence defaulted
repopulateDB(); // default repop DB

app.get('/stream/:id', async (req, res) => {
    const songId = req.params.id; 
    console.log('songId:', songId);
    try {
        const song = await Songs.findByPk(songId);
        if (song) {
            console.log(`Streaming file: ${song.path}`);
            streamFlacFile(song.path, {
                title:  song.title,
                artist: song.artists,
                album:  song.album
            }); 
            res.status(200).send({status: `Streaming song: ${song.title} by ${song.artists} on ${song.album}.`});
        } else {
            res.status(404).send({status: 'Song not found, silence continues...'});
        }
    } catch (err) {
        res.status(500).send({status: 'Error streaming file: ' + err.message});
    }
});

app.get('/list/albums', async (req, res) => {
    try {
        const albums = await Songs.findAll({
            attributes: [
                [sequelize.fn('DISTINCT', sequelize.col('album')), 'album'],
                'artists'
            ],
            group: ['album', 'artists']
        });

        // Dedupe by album name, keeping only the first occurrence
        const seen = new Set();
        const unique = albums.filter(album => {
            if (seen.has(album.album)) return false;
            seen.add(album.album);
            return true;
        });

        const albumList = await Promise.all(unique.map(async (album) => ({
            album: album.album,
            artists: album.artists.split(/[;,&]/)[0].trim(), // primary artist only
            cover: await getAlbumJpg(album.album, album.artists)
        })));

        res.status(200).send(albumList);
    } catch (err) {
        res.status(500).send({status: 'Error fetching albums: ' + err.message});
    }
});

app.get('/stream/album/:album', async (req, res) => {
    const albumName = req.params.album; 
    console.log('albumName:', albumName);
    try {
        const songs = await Songs.findAll({ where: { album: albumName } });
        if (songs.length === 0) {
            res.status(404).send({status: 'album not found, silence continues...'});
            return;
        }

        const playQueue = async (index) => {
            if (index >= songs.length) {
                console.log('End of queue reached.');
                startSilenceProcess(); 
                return;
            }

            const song = songs[index];
            if (song.path) {
                console.log(`Queue song id: ${song.songID}, path: ${song.path}`);
                await streamFlacFile(song.path, {
                    title:  song.title,
                    artist: song.artists,
                    album:  song.album
                }); 
                playQueue(index + 1); 
            } else {
                console.error(`Invalid song path for song ID: ${song.songID}`);
                playQueue(index + 1); 
            }
        };

        playQueue(0);
        res.status(200).send({status: `Playing album ${albumName}.`});
    } catch (err) {
        res.status(500).send({status: `Error streaming album ${albumName}: ` + err.message});
    }
});

// Refresh DB
app.get('/refresh', async (req, res) => {
    try {
        await Songs.destroy({ where: {} }); 
        //await Songs.destroy({ truncate: true, restartIdentity: true });
        const result = await repopulateDB();
        if (result === 1) {
            res.status(200).send({status: 'FLAC DATABASE REFRESHED WITH PATH: ' + givenPath});
        } else {
            res.status(500).send({status: "Catastrophic failure! " + JSON.stringify(result)});
        }
    } catch (err) {
        res.status(500).send({status: 'Error refreshing database: ' + err.message});
    }
});

app.get('/list', async (req, res) => {
    const songs = await listDB();
    res.status(200).send(songs);
});

//QUEUE SECTION

//list queue
app.get('/list/queue', async (req, res) => {
    const queue = await Queue.findAll();
    res.status(200).send(queue);
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
            res.status(200).send({status: 'Added file to queue: ' + songId});
        } else {
            res.status(404).send({status: 'Song ID not found in DB'});
        }
} catch (err) {
        res.status(500).send({status: 'Error adding file to queue: ' + err.message});
    }
}
);

//toggle queue
app.get('/queue/:status', async (req, res) => {
    if (req.params.status === 'true') {
        const queue = await Queue.findAll();
        if (queue.length === 0) {
            res.status(404).send({status: 'Queue is empty.'});
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
                await streamFlacFile(song.path, {
                    title:  song.title,
                    artist: song.artists,
                    album:  song.album
                }); 
                playQueue(index + 1); 
            } else {
                console.error(`Invalid song path for song ID: ${song.songID}`);
                playQueue(index + 1); 
            }
        };

        playQueue(0);
        res.status(200).send({status: 'Queue started.'});
    } else if (req.params.status === 'false') {
        startSilenceProcess();
        res.status(200).send({status: 'Queue stopped.'});
    } else {
        res.status(400).send({status: 'Invalid status. Use "true" or "false".'});
    }
});

// Drop queue
app.get('/drop/queue', async (req, res) => {
    try {
        await Queue.destroy({ where: {} });
        await startSilenceProcess()
        res.status(200).send({status: 'Queue dropped successfully.'});
    } catch (err) {
        res.status(500).send({status: 'Error dropping queue: ' + err.message});
    }
});

// Frontend configuration endpoint
app.get('/config', (req, res) => {
    res.status(200).json({status: 'Configuration retrieved successfully', apiBaseUrl: apiBaseUrl, phpConfig: phpConfig});
});

// Icecast status proxy endpoint (fixes CORS issues)
app.get('/icecast/status', async (req, res) => {
    try {
        const statusUrl = icecastFrontend.STATUS_URL;
        const response = await fetch(statusUrl);
        if (!response.ok) {
            throw new Error(`Icecast status fetch failed with status ${response.status}`);
        }
        const data = await response.json();
        res.status(200).json(data);
    } catch (err) {
        console.error('Error fetching Icecast status:', err);
        res.status(500).json({status: 'Error fetching Icecast status: ' + err.message});
    }
});

//init API
app.listen(apiport, () => {
    console.log(`Icecast Source API running on port ${apiport}`);
});