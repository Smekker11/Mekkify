//icecast connection params
const icecastserver = {
  ICECAST_HOST: '192.168.8.14',
  ICECAST_PORT: 8000,
  ICECAST_USER: 'smekker11',
  ICECAST_PASSWORD: '',
  ICECAST_MOUNT: '/flacs.ogg', // Set this to the desired mount point

};


//VERY VERY IMPORTANT!!!!
const givenPath = "/mnt/c/Users/mekky/Music/flac";// Path to the directory containing FLAC files
//VERY VERY IMPORTANT!!!!

// Port for the API
const apiport = 7887;

// SILENCE STREAMING ffmpeg params
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

export {icecastserver, givenPath, apiport, silenceArgs};