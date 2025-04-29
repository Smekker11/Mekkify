<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Mekkify Internet Radio</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <?php include 'frontend-methods.php'; ?>
    <div class="container">
        <header>
            <h1>Mekkify Internet Radio 🍊</h1>
            <p>Flac quality on-demand library with shared streaming!</p>
        </header>

        <nav>
            <ul>
                <li><a href="javascript:void(0)" onclick="resetUrl()">Home</a></li>
                <li><a href="?action=showtable">Library</a></li>
                <li><a href="?action=showqueue">Queue</a></li>
            </ul>
        </nav>

        <main>
            <section class="player">
                <?php
                if (isset($_GET['play'])) {
                    $id = $_GET['play'];
                    streamSong($id);
                }
                ?>
                <h2>Now Playing: <?php echo htmlspecialchars($nowPlaying); ?></h2>
                <button onclick="playStream('<?php echo $streamUrl; ?>')">▶ Play</button>
            </section>

            <?php
            if ($_GET['action'] == 'showtable') {
                echo generateMusicTable($songlist); // Display the library
            }
            if ($_GET['action'] == 'showqueue') {
                echo generateQueue(); // Display the queue
            }
            if (isset($_GET['add'])) {
                $id = $_GET['add'];
                addToQueue($id);
            }
            ?>

            <section class="news">
                <h3>📻 Station News</h3>
                <p>Welcome to Retro Vibes Radio! We're spinning your favorite hits 24/7.</p>
            </section>
        </main>

        <footer>
            <p>&copy; 2025 Retro Vibes Radio. Powered by old-school vibes 🌞</p>
        </footer>
    </div>
</body>
<script>
function resetUrl() {
    const url = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, url);
    window.location.href = url; // Reload the page without query parameters
}

function playStream(streamUrl) {
    let player = document.getElementById("icecastPlayer");
    if (!player) {
        player = document.createElement("audio");
        player.id = "icecastPlayer";
        player.style.display = "none";
        document.body.appendChild(player);
    }

    player.src = streamUrl;
    player.play().catch(err => {
        console.error("Playback failed:", err);
    });
}

function refreshLibraryAfterPlay() {
    setTimeout(function() {
        location.href = '?action=showtable'; // Refresh the library page
    }, 7000);
}

function contactApi(apiUrl, callback) {
    fetch(apiUrl, { method: "GET" })
        .then(response => {
            if (!response.ok) {
                throw new Error("API request failed with status " + response.status);
            }
            return response.text();
        })
        .then(data => {
            alert("API Response: " + data);
            if (callback) callback();
        })
        .catch(error => {
            console.error("Error contacting API:", error);
            alert("Error contacting API: " + error.message);
        });
}
</script>
</html>