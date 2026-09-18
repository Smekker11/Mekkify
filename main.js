import { repopulateDB, listDB, streamFlacFile, startSilenceProcess, getAlbumCover, getLocalAlbumCoverPath, getOptimizedAlbumCoverPath } from './methods.js';
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
let playbackSession = 0;

startSilenceProcess(); // Radio silence defaulted
repopulateDB(); // default repop DB

app.get('/stream/:id', async (req, res) => {
    const songId = req.params.id; 
    playbackSession += 1;
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
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 24, 1), 48);
        const songs = await Songs.findAll({
            attributes: ['album', 'artists', 'path']
        });

        const uniqueAlbums = new Map();
        for (const song of songs) {
            const albumKey = `${song.album}\u0000${song.artists}`;
            if (!uniqueAlbums.has(albumKey)) {
                uniqueAlbums.set(albumKey, song);
            }
        }

        const pageAlbums = [...uniqueAlbums.values()].slice((page - 1) * pageSize, page * pageSize);
        const albumList = await Promise.all(pageAlbums.map(async (song) => {
            return {
                album: song.album,
                artists: song.artists.split(/[;,&]/)[0].trim(), // primary artist only
                cover: await getAlbumCover(song.album, song.artists, song.path)
            };
        }));

        res.status(200).send(albumList);
    } catch (err) {
        res.status(500).send({status: 'Error fetching albums: ' + err.message});
    }
});

app.get('/album-cover', async (req, res) => {
    const albumName = req.query.album;
    if (typeof albumName !== 'string' || !albumName) {
        res.status(400).send({ status: 'Album name is required.' });
        return;
    }

    try {
        const song = await Songs.findOne({
            where: { album: albumName },
            attributes: ['path']
        });
        const coverPath = song ? await getOptimizedAlbumCoverPath(song.path) : null;

        if (!coverPath) {
            res.status(404).send({ status: 'Album cover not found.' });
            return;
        }

        if (!fs.existsSync(coverPath)) {
            res.status(404).send({ status: 'Album cover file is unavailable.' });
            return;
        }

        res.sendFile(coverPath, (error) => {
            if (error && !res.headersSent) {
                res.status(error.statusCode || 500).send({ status: 'Error serving album cover.' });
            }
        });
    } catch (err) {
        res.status(500).send({ status: 'Error loading album cover: ' + err.message });
    }
});

app.get('/stream/album/:album', async (req, res) => {
    const albumName = req.params.album; 
    const session = ++playbackSession;
    console.log('albumName:', albumName);
    try {
        const songs = await Songs.findAll({ where: { album: albumName } });
        if (songs.length === 0) {
            res.status(404).send({status: 'album not found, silence continues...'});
            return;
        }

        const playQueue = async (index) => {
            if (session !== playbackSession) return;
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
                }, { startSilenceOnClose: false });
                if (session === playbackSession) await playQueue(index + 1);
            } else {
                console.error(`Invalid song path for song ID: ${song.songID}`);
                await playQueue(index + 1);
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
        const session = ++playbackSession;
        const queue = await Queue.findAll();
        if (queue.length === 0) {
            res.status(404).send({status: 'Queue is empty.'});
            return;
        }

        const playQueue = async (index) => {
            if (session !== playbackSession) return;
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
                }, { startSilenceOnClose: false });
                if (session === playbackSession) await playQueue(index + 1);
            } else {
                console.error(`Invalid song path for song ID: ${song.songID}`);
                await playQueue(index + 1);
            }
        };

        playQueue(0);
        res.status(200).send({status: 'Queue started.'});
    } else if (req.params.status === 'false') {
        playbackSession += 1;
        startSilenceProcess();
        res.status(200).send({status: 'Queue stopped.'});
    } else {
        res.status(400).send({status: 'Invalid status. Use "true" or "false".'});
    }
});

// Drop queue
app.get('/drop/queue', async (req, res) => {
    try {
    playbackSession += 1;
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