<?php

function generateMusicTable($jsonData) {
    $data = json_decode($jsonData, true);

    if (!$data || !is_array($data)) {
        return "<p>Invalid JSON data.</p>";
    }

    $html = '<table class="center" border="1" cellpadding="8" cellspacing="0">';
    $html .= '<thead><tr>';
    $html .= '<th>ID</th><th>Title</th><th>Artists</th><th>Album</th><th>Actions</th>';
    $html .= '</tr></thead><tbody>';

    foreach ($data as $track) {
        $id = htmlspecialchars($track['id']);
        $title = htmlspecialchars($track['title']);
        $artists = htmlspecialchars($track['artists']);
        $album = htmlspecialchars($track['album']);

        $playLink = "<a href=\"?action=showtable&play=$id\" onclick=\"refreshLibraryAfterPlay()\">Play</a>";
        $addLink = "<a href=\"?action=showtable&add=$id\">Add to Queue</a>";

        $html .= "<tr>";
        $html .= "<td>$id</td>";
        $html .= "<td>$title</td>";
        $html .= "<td>$artists</td>";
        $html .= "<td>$album</td>";
        $html .= "<td>$playLink | $addLink</td>";
        $html .= "</tr>";
    }

    $html .= '</tbody></table>';
    return $html;
}

function streamSong($id) {
    $url = 'http://localhost:7887/stream/' . $id;
    $response = file_get_contents($url);
    if ($response === FALSE) {
        die('API Error occurred');
    }
    echo "<script>
        setTimeout(function() {
            location.href = '?action=showtable'; // Refresh the library page
        }, 1000);
    </script>";
}

function addToQueue($id) {
    $url = 'http://localhost:7887/queue/add/' . $id;
    file_get_contents($url);
    echo "<script>
        setTimeout(function() {
            location.href = '?action=showtable'; // Refresh the library page
        }, 1000);
    </script>";
}

function generateQueue() {
    $url = 'http://localhost:7887/list/queue'; // Replace with your API URL
    $response = file_get_contents($url);
    if ($response === FALSE) {
        die('API Error occurred');
    }
    $data = json_decode($response, true);
    if (!$data || !is_array($data)) {
        return "<p>Invalid JSON data.</p>";
    }
    $html = '<table class="center" border="1" cellpadding="8" cellspacing="0">';
$html .= '<thead><tr>';
$html .= '<th>Queue Position</th><th>Song ID</th><th>Path</th><th>Created At</th><th>Updated At</th>';
$html .= '</tr></thead><tbody>';

foreach ($data as $track) {
    $queuePOS = htmlspecialchars($track['queuePOS']);
    $songID = htmlspecialchars($track['songID']);
    $path = htmlspecialchars($track['path']);
    $createdAt = htmlspecialchars($track['createdAt']);
    $updatedAt = htmlspecialchars($track['updatedAt']);

    $html .= "<tr>";
    $html .= "<td>$queuePOS</td>";
    $html .= "<td>$songID</td>";
    $html .= "<td>$path</td>";
    $html .= "<td>$createdAt</td>";
    $html .= "<td>$updatedAt</td>";
    $html .= "</tr>";
}

$html .= '</tbody></table><br>';

// Add two buttons below the table
$html .= '<button onclick="contactApi(\'http://localhost:7887/queue/true\')">Play Queue</button> ';
$html .= '<button onclick="contactApi(\'http://localhost:7887/drop/queue\')">Drop Queue</button>';
return $html;
}

function fetchSongList(){
    $url = 'http://localhost:7887/list'; // Replace with your API URL
    $response = file_get_contents($url);
    if ($response === FALSE) {
        die('API Error occurred');
    }
    return $response; // fetchList function
}

$songlist = fetchSongList();
?>

<?php//BUTTON SECTION?>
<?php
$icecastStatusUrl = "http://smekker.go.ro:8000/status-json.xsl";

// Fetch metadata from Icecast server
$response = file_get_contents($icecastStatusUrl);
if (!$response) {
    die("Unable to fetch Icecast data.");
}

$data = json_decode($response, true);

// Get mount info (example assumes one mount point)
$mountPoint = "/flacs.ogg"; // change if needed
$sourceData = null;

// Find correct mount point
if (isset($data['icestats']['source'])) {
    $sources = $data['icestats']['source'];

    // If there are multiple mount points
    if (isset($sources[0])) {
        foreach ($sources as $source) {
            if ($source['listenurl'] ?? false && str_ends_with($source['listenurl'], $mountPoint)) {
                $sourceData = $source;
                break;
            }
        }
    } else {
        // Only one source
        $sourceData = $sources;
    }
}

if (!$sourceData) {
    echo "<h1 style='color: white;'>Stream not found.</h1>";
    exit;
}

// Extract metadata
$title = $sourceData['title'] ?? 'No Title';
$artist = $sourceData['artist'] ?? '';
$nowPlaying = $sourceData['artist'] && $sourceData['title'] ? "$artist - $title" : ($sourceData['title'] ?? "nothing.");

// Stream URL
$streamUrl = "http://smekker.go.ro:8000$mountPoint";
?>