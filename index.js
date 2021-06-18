require('dotenv').config();
require('./root_path');

const fs = require('fs');
const util = require('util');
const express = require('express');
const cookie = require('cookie');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const child_process = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

const mkdir = util.promisify(fs.mkdir);
const rmdir = util.promisify(fs.rmdir);

const { parseAuthenticationCredentials } = include('$modules/Utils');

const wss = new WebSocket.Server({ noServer: true });

const app = express();
const httpServer = http.Server(app);

const PORT = process.env.PORT || 3002;

const STREAM_FOLDER = 'streams';

app.use(cors({
	origin: process.env.FRONTEND_URL
}));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use('/streams', express.static(path.join(__dirname, '/' + STREAM_FOLDER)));

// remove old stream folder
try {
	if (fs.existsSync(STREAM_FOLDER)) {
		fs.rmdirSync(`./${STREAM_FOLDER}`, { recursive: true });
	}

	fs.mkdirSync(`./${STREAM_FOLDER}`);
} catch (err) {
	console.error("ERROR CLEARING OLD STREAM FOLDER", err);
}

const heartbeatInterval = setInterval(() => {
	wss.clients.forEach(ws => {
		if(ws.isAlive === false) return ws.terminate();

		ws.isAlive = false;
		ws.send("ping");
	});
}, 15000);

wss.on('connection', async (ws, request, streamID) => {
	await mkdir('streams/' + streamID);

	let aliveTimeout;
	let isAlive = true;
	let isActivating = false;

	const ffmpeg = child_process.spawn('ffmpeg', [
		// FFmpeg will read input video from STDIN
		'-i', '-',

		'-c:v', 'libx264',
		'-crf', '40',
		'-preset', 'ultrafast',
		'-tune', 'zerolatency',
		'-hls_time', '5',
		// '-c:a', 'aac',
		// '-b:a', '128k',
		// '-ac', '2',
		'-f', 'hls',
		
		'streams/' + streamID + '/stream.m3u8'
	]);

	// If FFmpeg stops for any reason, close the WebSocket connection.
	ffmpeg.on('close', (code, signal) => {
		console.log('FFmpeg child process closed, code ' + code + ', signal ' + signal);
		ws.terminate();

		cleanupStream(streamID);
	});
	
	// Handle STDIN pipe errors by logging to the console.
	// These errors most commonly occur when FFmpeg closes and there is still
	// data to write.  If left unhandled, the server will crash.
	ffmpeg.stdin.on('error', (e) => {
		console.log('FFmpeg STDIN Error', e);
	});
	
	// FFmpeg outputs all of its messages to STDERR.  Let's log them to the console.
	ffmpeg.stderr.on('data', (data) => {
		console.log('FFmpeg STDOUT:', data.toString());
	});

	// When data comes in from the WebSocket, write it to FFmpeg's STDIN.
	ws.on('message', (msg) => {
		console.log('DATA', msg);
		ffmpeg.stdin.write(msg);

		// Keep the websocket connection alive
		ws.isAlive = true;

		// Let the backend server know that this stream is still active every 4 seconds.
		if(!isActivating) {
			isActivating = true;
			activateStream(streamID).then(res => {
				if(res.err) {
					console.log("terminated");
					return ws.terminate();
				}

				setTimeout(() => {
					isActivating = false;
				}, 4000);
			});
		}
	});

	ws.on('pong', function() {
		ws.isAlive = true;
	});
	
	// If the client disconnects, stop FFmpeg.
	ws.on('close', (e) => {
		ffmpeg.kill('SIGINT');

		cleanupStream(streamID);
	});
});

httpServer.on('upgrade', async (request, socket, head) => {
	if(request.url.startsWith("/socket")) {
		let streamResponse = await authenticateSocket(request).catch(e => null);

		if(!streamResponse) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.destroy();
			return;
		}

		wss.handleUpgrade(request, socket, head, ws => {
			wss.emit('connection', ws, request, streamResponse.id);
		});
	}
});

async function cleanupStream(streamID) {
	return await rmdir(`./streams/${streamID}`, { recursive: true });
}

async function activateStream(streamID) {
	console.log("Activating", streamID);
	return await fetch(process.env.BACKEND_URL + "/activate_stream", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": "Basic " + process.env.BACKEND_KEY
		},
		body: JSON.stringify({
			streamID
		})
	}).then(r => r.json());
}

function authenticateSocket(request) {
	return new Promise(async (resolve, reject) => {
		const cookies = cookie.parse(request.headers["cookie"]);
		const rawToken = cookies["X-Authorization"];

		if(
			!rawToken
		) return reject();

		let credentials = parseAuthenticationCredentials(rawToken);
		if(!credentials) return reject();

		let streamVerification = await fetch(process.env.BACKEND_URL + "/verify", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": "Basic " + process.env.BACKEND_KEY
			},
			body: JSON.stringify(credentials)
		}).then(r => r.json());

		resolve(streamVerification.err ? null : credentials);
	});
}

httpServer.listen(PORT, () => {
	console.log('STREAM SERVER - listening on *:' + PORT);
});