<!DOCTYPE html>
<html lang="en">
<head>
    <link rel="apple-touch-icon" sizes="180x180" href="./favicon/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="./favicon/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="./favicon/favicon-16x16.png">
    <link rel="manifest" href="./favicon/site.webmanifest">
    <meta charset="UTF-8">
    <title>Mekkify Internet Radio</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <?php include 'frontend-methods.php'; ?>
    <div class="container">
        <header>
            <h1>Mekkify Internet Radio 2.1.3 🍊</h1>
            <p>Flac quality mandarin music streaming service.</p>
        </header>

        <nav>
            <ul>
                <li><a href="javascript:void(0)" onclick="resetUrl()">Home</a></li>
                <li><a href="?action=showtable">Library</a></li>
                <li><a href="?action=showalbums">Albums</a></li>
                <li><a href="?action=showqueue">Queue</a></li>
                <li><a href="<?php echo htmlspecialchars($streamUrl . $mountPoint); ?>" target="_blank" rel="noopener">IC2 source</a></li>
            </ul>
        </nav>

        <main>
            <section class="player">
                <h2>Now Playing:</h2>
                <img id="nowPlayingCover" src="" alt="Cover Art">
                <p id="nowPlayingArtist" style="font-size: 1.1em; font-weight: bold; margin: 5px 0;">Unknown Artist</p>
                <h2 id="nowPlaying" style="margin: 10px 0;">Unknown Track</h2>
                <div class="player-controls">
                    <button onclick="playStream('<?php echo $streamUrl . $mountPoint; ?>')">▶ Play</button>
                    <button type="button" class="action-button" onclick="skipSong(event)">Skip Song</button>
                </div>
                <p id="nowPlayingQuality" style="font-size: 0.9em; color: #666; margin: 5px 0;">No stream</p>
                <audio id="icecastPlayer" preload="none"></audio>
            </section>

            <?php
            if ($_GET['action'] == 'showtable') {
                echo generateMusicTable($songlist); // Display the library
            }
            if ($_GET['action'] == 'showqueue') {
                echo generateQueue(); // Display the queue
            }
            if ($_GET['action'] == 'showalbums') {
                echo generateAlbums(); // Display the albums
            }
            if (isset($_GET['play'])) {
                $id = $_GET['play'];
                streamSong($id);
            }
            if (isset($_GET['playalbum'])) {
                $album = $_GET['playalbum'];
                playAlbum($album);
            }
            if (isset($_GET['add'])) {
                $id = $_GET['add'];
                addToQueue($id);
            }
            ?>

            <section class="news">
                <h3>🍊📰 Mekkify News</h3>
                <p>Mekkify V2.1.3 is now live! Spotify, Apple Music, and YT Music has now gone bankrupt!</p>
                <p>BUGFIXES</p>
                <p>.callback handoff fixed!</p>
                <p>.mediarendering issue fixed!</p>
                <p>.better albums structure in tree</p>
                <p>.coverart cache</p>
            </section>
        </main>

        <footer>
            <p>&copy; 2026 Mekkify Internet Radio🍊. Meperky Cod. All rights reserved.</p>
        </footer>
    </div>

</body>
<script>
function resetUrl() {
    const url = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, url);
    window.location.href = url; // Reload the page without query parameters
}

let streamUrl = '';
let streamShouldPlay = false;
let reconnectTimer = null;
let playbackAttempt = 0;

function getStreamUrlWithCacheBuster() {
    const separator = streamUrl.includes('?') ? '&' : '?';
    return `${streamUrl}${separator}client=${Date.now()}`;
}

function reconnectStream() {
    if (!streamShouldPlay || reconnectTimer !== null) return;

    reconnectTimer = setTimeout(function() {
        reconnectTimer = null;
        startPlayback(false);
    }, 1000);
}

async function startPlayback(showSuccessNotification) {
    const player = document.getElementById('icecastPlayer');
    if (!player || !streamShouldPlay || !streamUrl) return;

    const attempt = ++playbackAttempt;
    player.pause();
    player.src = getStreamUrlWithCacheBuster();
    player.load();

    try {
        await player.play();
        if (showSuccessNotification && attempt === playbackAttempt) {
            showNotification("Stream started playing!", "success");
        }
    } catch (error) {
        if (attempt !== playbackAttempt || error.name === 'AbortError') {
            reconnectStream();
            return;
        }

        console.error('Playback failed:', error);
        showNotification('Playback failed: ' + error.message, 'error');
        reconnectStream();
    }
}

function playStream(mountPoint) {
    streamUrl = mountPoint;
    streamShouldPlay = true;
    if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    startPlayback(true);
}

async function skipSong(event) {
    event.preventDefault();
    showNotification('Skipping a song...', 'info');

    try {
        const response = await fetch('?play=1', {
            cache: 'no-store',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        showNotification('Skipped a song', 'success');
    } catch (error) {
        console.error('Skip failed:', error);
        showNotification('Skip failed: ' + error.message, 'error');
    }
}

function contactApiStatus(message) {
    showNotification(message, 'info');
}

// Notification system for older device compatibility
function showNotification(message, type) {
    type = type || 'info'; // default to info
    
    // Remove existing notification if present
    var existingNotif = document.getElementById('notificationPopup');
    if (existingNotif) {
        existingNotif.parentNode.removeChild(existingNotif);
    }
    
    // Create notification element
    var notif = document.createElement('div');
    notif.id = 'notificationPopup';
    notif.className = 'notification ' + type;
    notif.textContent = message;
    
    // Add to body
    document.body.appendChild(notif);
    
    // Remove after 2 seconds and clear GET variables
    setTimeout(function() {
        if (notif && notif.parentNode) {
            notif.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(function() {
                if (notif && notif.parentNode) {
                    notif.parentNode.removeChild(notif);
                }
                // Clear GET variables from URL
                var url = window.location.protocol + "//" + window.location.host + window.location.pathname;
                window.history.replaceState({}, document.title, url);
            }, 300);
        }
    }, 2000);
}

// Get config values from PHP
const statusUrl = '<?php echo htmlspecialchars($icecastStatusUrl, ENT_QUOTES); ?>';

async function updateMetadata() {
    try {
        const res = await fetch(statusUrl);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        if (data.icestats && data.icestats.source) {
            const source = Array.isArray(data.icestats.source) 
                ? data.icestats.source[0] 
                : data.icestats.source;
            
            const title = source.title || 'Mekkify Radio';
            const coverKey = encodeURIComponent(`${title}|${source.artist || ''}`);
            if (title == 'Mekkify Radio') {
                document.getElementById("nowPlayingCover").src = `./mekkify_defo.jpg?track=${coverKey}`;
            } else {
                document.getElementById("nowPlayingCover").src = `./cover.jpg?track=${coverKey}`;
            }

            const artist = source.artist || 'Mandarină audiofilă';
            const bitrate = source.audio_bitrate ? (source.audio_bitrate / 1000) : source['ice-bitrate'] || '0';
            const channels = source.audio_channels || 2;
            const samplerate = source.audio_samplerate ? (source.audio_samplerate / 1000) : '44.1';
            
            const qualityStr = `${bitrate}kbps | ${channels}ch | ${samplerate}kHz`;
            
            const artistElement = document.getElementById("nowPlayingArtist");
            const titleElement = document.getElementById("nowPlaying");
            const qualityElement = document.getElementById("nowPlayingQuality");
            
            if (artistElement) artistElement.textContent = artist;
            if (titleElement) titleElement.textContent = title;
            if (qualityElement) qualityElement.textContent = qualityStr;
            
            if ('mediaSession' in navigator) {
                let artworkArr;
                if (title == 'Mekkify Radio') {
                    artworkArr = [{ src: `./mekkify_defo.jpg?track=${coverKey}`, sizes: '300x300', type: 'image/jpeg' }];
                } else {
                    artworkArr = [{ src: `./cover.jpg?track=${coverKey}`, sizes: '300x300', type: 'image/jpeg' }];
                }
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: title,
                    artist: artist,
                    album: source.server_description || 'Mekkify Radio',
                    artwork: artworkArr
                });
            } // closes if mediaSession
        } // closes if data.icestats
    } catch (error) {
        console.error('Error updating metadata:', error);
    }
}

// Update song data on page load and when playing
document.addEventListener('DOMContentLoaded', function() {
    const audio = document.getElementById('icecastPlayer');

    if (audio) {
        audio.addEventListener('ended', reconnectStream);
        audio.addEventListener('error', reconnectStream);
        audio.addEventListener('stalled', reconnectStream);
        audio.addEventListener('play', () => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
            }
        });
        audio.addEventListener('pause', () => {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
        });
    }
    
    // Show API notification if available from PHP
    var notificationMessage = '<?php echo htmlspecialchars($apiNotification); ?>';
    var notificationType = '<?php echo htmlspecialchars($apiNotificationType); ?>';
    if (notificationMessage) {
        showNotification(notificationMessage, notificationType);
    }
    
    // Initial metadata update
    updateMetadata();
    
    // Update metadata periodically (every 2 seconds)
    setInterval(updateMetadata, 2000);
});
</script>
</html>