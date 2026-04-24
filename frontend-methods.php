<?php

// Read configuration from filesystem
$configPath = __DIR__ . '/config.json';
if (!file_exists($configPath)) {
    die("<h1 style='color: white;'>Error</h1><p style='color: white;'>Configuration file not found at $configPath. Make sure config.json exists.</p>");
}
$configResponse = file_get_contents($configPath);
if ($configResponse === FALSE) {
    die("<h1 style='color: white;'>Error</h1><p style='color: white;'>Unable to read configuration file from filesystem.</p>");
}
$config = json_decode($configResponse, true);
$apiBaseUrl = $config['apiBaseUrl'];
$streamUrl = $config['icecastFrontend']['STREAM_URL'];
$mountPoint = $config['icecastserver']['ICECAST_MOUNT'];
$icecastStatusUrl = $config['icecastFrontend']['STATUS_URL'];

// Session variables to store API response messages
$apiNotification = '';
$apiNotificationType = 'info';

// Helper function for API error handling
function handleApiError($message, $attemptedUrl, $additionalInfo = '') {
    global $apiBaseUrl;
    $errorHtml = "<h1 style='color: white;'>API Error occurred</h1>";
    $errorHtml .= "<p style='color: white;'>$message</p>";
    $errorHtml .= "<p style='color: white;'>Current config:</p>";
    $errorHtml .= "<p style='color: white;'>API Base URL: $apiBaseUrl</p>";
    $errorHtml .= "<p style='color: white;'>Requested URL: $attemptedUrl</p>";
    if ($additionalInfo) {
        $errorHtml .= "<p style='color: white;'>$additionalInfo</p>";
    }
    $errorHtml .= "<button onclick='location.reload()'>Retry</button>";
    echo $errorHtml;
    exit;
}

function generateAlbums() {
    global $apiBaseUrl;
    $url = $apiBaseUrl . 'list/albums';
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to fetch album list.', $url);
    }
    $albums = json_decode($response, true);
    if (!$albums || !is_array($albums)) {
        return "<p>Invalid album data.</p>";
    }

    $html = '<div class="album-grid">';
    foreach ($albums as $albumData) {
        $albumName = htmlspecialchars($albumData['album'] ?? 'Unknown Album');
        $artists = htmlspecialchars($albumData['artists'] ?? 'Unknown Artist');
        $coverUrl = htmlspecialchars($albumData['cover'] ?? '');
        $albumLink = '?action=showalbums&playalbum=' . rawurlencode($albumData['album'] ?? '');

        $html .= '<div class="album-card">';
        $html .= '<a href="' . $albumLink . '" onclick="contactApiStatus(\'Contacting album stream...\')">';
        $html .= '<img src="' . $coverUrl . '" alt="Cover art for ' . $albumName . '">';
        $html .= '<div class="album-card-meta">';
        $html .= '<span class="album-title">' . $albumName . '</span>';
        $html .= '<span class="album-artists">' . $artists . '</span>';
        $html .= '</div>';
        $html .= '</a>';
        $html .= '</div>';
    }
    $html .= '</div>';

    return $html;
}

// Helper function for stream/Icecast error handling
function handleStreamError($message, $additionalInfo = '') {
    global $streamUrl, $mountPoint, $icecastStatusUrl;
    $errorHtml = "<h1 style='color: white;'>Stream Error occurred</h1>";
    $errorHtml .= "<p style='color: white;'>$message</p>";
    $errorHtml .= "<p style='color: white;'>check Icecast server, API status and mount point configuration.</p>";
    $errorHtml .= "<p style='color: white;'>Current config:</p>";
    $errorHtml .= "<p style='color: white;'>Stream URL: $streamUrl</p>";
    $errorHtml .= "<p style='color: white;'>Mount Point: $mountPoint</p>";
    $errorHtml .= "<p style='color: white;'>Icecast Status URL: $icecastStatusUrl</p>";
    if ($additionalInfo) {
        $errorHtml .= "<p style='color: white;'>$additionalInfo</p>";
    }
    $errorHtml .= "<button onclick='location.reload()'>Retry</button>";
    echo $errorHtml;
    exit;
}

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

        $playLink = "<a class=\"table-button\" href=\"?action=showtable&play=$id\">Play</a>";
        $addLink = "<a class=\"table-button\" href=\"?action=showtable&add=$id\">Add to Queue</a>";

        $html .= "<tr>";
        $html .= "<td>$id</td>";
        $html .= "<td>$title</td>";
        $html .= "<td>$artists</td>";
        $html .= "<td>$album</td>";
        $html .= "<td class=\"table-action-cell\">$playLink $addLink</td>";
        $html .= "</tr>";
    }

    $html .= '</tbody></table>';
    return $html;
}

function streamSong($id) {
    global $apiBaseUrl, $apiNotification, $apiNotificationType;
    $url = $apiBaseUrl . 'stream/' . $id;
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to stream song.', $url, "Song ID: $id");
    }
    $responseData = json_decode($response, true);
    $apiNotification = isset($responseData['status']) ? $responseData['status'] : 'Stream started successfully!';
    $apiNotificationType = 'success';
}

function playAlbum($albumName) {
    global $apiBaseUrl, $apiNotification, $apiNotificationType;
    $url = $apiBaseUrl . 'stream/album/' . rawurlencode($albumName);
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to start album stream.', $url, "Album: $albumName");
    }
    $responseData = json_decode($response, true);
    $apiNotification = isset($responseData['status']) ? $responseData['status'] : 'Album stream started successfully!';
    $apiNotificationType = 'success';
}

function addToQueue($id) {
    global $apiBaseUrl, $apiNotification, $apiNotificationType;
    $url = $apiBaseUrl . 'queue/add/' . $id;
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to add song to queue.', $url, "Song ID: $id");
    }
    $responseData = json_decode($response, true);
    $apiNotification = isset($responseData['status']) ? $responseData['status'] : 'Added to queue!';
    $apiNotificationType = 'success';
}

function generateQueue() {
    global $apiBaseUrl;
    $url = $apiBaseUrl . 'list/queue';
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to fetch queue list.', $url);
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

// Add two form buttons below the table
$html .= '<div class="queue-actions">';
$html .= '<form method="POST" style="display: inline;">';
$html .= '<input type="hidden" name="queue_action" value="play">';
$html .= '<button type="submit" class="action-button">Play Queue</button>';
$html .= '</form> ';
$html .= '<form method="POST" style="display: inline;">';
$html .= '<input type="hidden" name="queue_action" value="drop">';
$html .= '<button type="submit" class="action-button">Drop Queue</button>';
$html .= '</form>';
$html .= '</div>';

return $html;
}

function playQueue() {
    global $apiBaseUrl, $apiNotification, $apiNotificationType;
    $url = $apiBaseUrl . 'queue/true';
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to play queue.', $url);
    }
    $responseData = json_decode($response, true);
    $apiNotification = isset($responseData['status']) ? $responseData['status'] : 'Queue started playing!';
    $apiNotificationType = 'success';
}

function dropQueue() {
    global $apiBaseUrl, $apiNotification, $apiNotificationType;
    $url = $apiBaseUrl . 'drop/queue';
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to drop queue.', $url);
    }
    $responseData = json_decode($response, true);
    $apiNotification = isset($responseData['status']) ? $responseData['status'] : 'Queue dropped!';
    $apiNotificationType = 'success';
}

function fetchSongList(){
    global $apiBaseUrl;
    $url = $apiBaseUrl . 'list';
    $response = file_get_contents($url);
    if ($response === FALSE) {
        handleApiError('Failed to fetch song list.', $url);
    }
    return $response; // fetchList function
}

// Handle form submissions for queue actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['queue_action'])) {
        if ($_POST['queue_action'] === 'play') {
            playQueue();
        } elseif ($_POST['queue_action'] === 'drop') {
            dropQueue();
        }
    }
}

$songlist = fetchSongList();
?>
