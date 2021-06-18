# dippr
![](https://i.imgur.com/9ybZ2SX.png)

Dippr is an open-source livestreaming service.

The entire site spans across 3 repositories: [Backend](https://github.com/dippr/dippr_backend) - **Streaming** - [Client](https://github.com/dippr/dippr_client)

# dippr_stream
The streaming server handles the input source WebSocket connections, stream transcoding, and HLS streaming outputs.

## Running
Create an `.env` file in the root directory based off of the `.env.example` file.

```bash
$ git clone https://github.com/dippr/dippr_stream
$ cd dippr_stream
$ npm i
$ npm test
```

[ffmpeg](https://www.ffmpeg.org/) is required.