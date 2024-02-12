require("dotenv").config();
const OpenAI = require("openai");
const fs = require("fs").promises;
const createReadStream = require("fs").createReadStream;
const ffmpegStatic = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const argv = require("process").argv;

ffmpeg.setFfmpegPath(ffmpegStatic);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const whiteFormatList = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"];

const segmentDuration = 60;

const maxFileSize = 25 * 1024 * 1024;

(async function main() {
  var finalTranscription = "";

  try {
    const filename = argv[2];

    if (!filename) {
      throw new Error("File name not exist");
    }

    const format = filename.split(".").pop();

    if (!whiteFormatList.includes(format)) {
      throw new Error(`Invalid format. Supported: ${whiteFormatList}`);
    }

    await fs.mkdir("./tmp", { recursive: true });

    await extractAudioAndSplitIntoSegments(filename);

    const stats = await fs.stat("audio.mp3");

    if (stats.size > maxFileSize) {
      (await fs.readdir("./tmp"))
        .filter((name) => name.startsWith("output"))
        .forEach(async (name) => {
          finalTranscription += " " + (await execFile(filename));
        });
    } else {
      finalTranscription += " " + (await execFile(filename));
    }

    await fs.rm("./tmp", { recursive: true, force: true });

    await fs.writeFile("output.txt", finalTranscription);
  } catch (err) {
    console.error(err);
  }
})();

function extractAudioAndSplitIntoSegments(filename) {
  return new Promise(function (resolve, reject) {
    ffmpeg()
      .input(filename)
      .outputOptions("-ab", "192k")
      .addOption("-f segment")
      .addOption(`-segment_time ${segmentDuration}`)
      .output("tmp/output%d.mp3")
      .saveToFile("audio.mp3")
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`Processing: ${Math.floor(progress.percent)}% done`);
        }
      })
      .on("end", () => {
        console.log("FFmpeg has finished");
        resolve();
      })
      .on("error", reject);
  });
}

async function execFile(filename) {
  const stream = createReadStream(filename);

  const transcription = await openai.audio.transcriptions.create({
    file: stream,
    model: "whisper-1",
  });

  return transcription.text;
}
