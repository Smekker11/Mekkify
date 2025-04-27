const icecastserver = {
  ICECAST_HOST: '192.168.8.14',
  ICECAST_PORT: 8000,
  ICECAST_USER: 'smekker11',
  ICECAST_PASSWORD: 'FX516PM#.',
  ICECAST_MOUNT: '/flacs.ogg', // Set this to the desired mount point
  //ICECAST_URL: `icecast://smekker11:FX516PM#.@192.168.8.14:8000/flacs.ogg` // Preformatted Icecast URL
};

const givenPath = "/mnt/c/Users/mekky/Music/flac";
const apiport = 7887;


//FFMPEG ARGS

const ffmpegArgs = [
  '-re',              // Read input at native frame rate
  '-i', filePath,     // Input FLAC file or stream
  '-c:a', 'libvorbis', // Use the Vorbis encoder
  '-b:a', '192k',     // Set audio bitrate to 192 kbps for good quality
  '-ar', '44100',     // Set audio sample rate to 44.1 kHz
  '-ac', '2',         // Ensure stereo audio
  '-content_type', 'audio/ogg', // Set content type to OGG
  '-vn',              // Disable video
  '-f', 'ogg',        // Use OGG format
  `icecast://${encodeURIComponent(icecastserver.ICECAST_USER)}:${encodeURIComponent(icecastserver.ICECAST_PASSWORD)}@${icecastserver.ICECAST_HOST}:${icecastserver.ICECAST_PORT}${icecastserver.ICECAST_MOUNT}`
];

// SILENCE STREAMING
const silenceArgs = [
  '-re',              // Read input at native frame rate (1x speed)
  '-f', 'lavfi',      // Use lavfi to generate audio
  '-i', 'anullsrc=r=44100:cl=stereo', // Generate silent audio
  '-c:a', 'libvorbis', // Use the Vorbis encoder
  '-b:a', '128k',     // Set audio bitrate to 128 kbps
  '-ar', '44100',     // Set audio sample rate to 44.1 kHz
  '-ac', '2',         // Ensure stereo audio
  '-content_type', 'audio/ogg', // Set content type to OGG
  '-f', 'ogg',        // Use OGG format
  `icecast://${icecastserver.ICECAST_USER}:${icecastserver.ICECAST_PASSWORD}@${icecastserver.ICECAST_HOST}:${icecastserver.ICECAST_PORT}${icecastserver.ICECAST_MOUNT}`
];

export {icecastserver, givenPath, apiport,ffmpegArgs, silenceArgs};