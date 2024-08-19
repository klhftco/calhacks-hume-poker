import { Emotion, EmotionName } from "../../lib/data/emotion";
import { None, Optional } from "../../lib/utilities/typeUtilities";
import { useContext, useEffect, useRef, useState } from "react";

import { AuthContext } from "../menu/Auth";
import { Descriptor } from "./Descriptor";
import { FacePrediction } from "../../lib/data/facePrediction";
import { FaceTrackedVideo } from "./FaceTrackedVideo";
import { LoaderSet } from "./LoaderSet";
import { TopEmotions } from "./TopEmotions";
import { TrackedFace } from "../../lib/data/trackedFace";
import { VideoRecorder } from "../../lib/media/videoRecorder";
import { blobToBase64 } from "../../lib/utilities/blobUtilities";
import { getApiUrlWs } from "../../lib/utilities/environmentUtilities";
import OpenAI from "openai";

type FaceWidgetsProps = {
  onCalibrate: Optional<(emotions: Emotion[]) => void>;
};

export function FaceWidgets({ onCalibrate }: FaceWidgetsProps) {
  const authContext = useContext(AuthContext);
  const socketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<VideoRecorder | null>(null);
  const photoRef = useRef<HTMLCanvasElement | null>(null);
  const mountRef = useRef(true);
  const recorderCreated = useRef(false);
  const numReconnects = useRef(0);
  const [trackedFaces, setTrackedFaces] = useState<TrackedFace[]>([]);
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [status, setStatus] = useState("");
  const numLoaderLevels = 5;
  const maxReconnects = 3;
  const loaderNames: EmotionName[] = [
    "Calmness",
    "Concentration",
    "Contemplation",
    "Boredom",
    "Disappointment",
    "Contempt",
    "Sadness",
    "Distress",
    "Anxiety"
    // "Calmness",
    // "Joy",
    // "Amusement",
    // "Anger",
    // "Confusion",
    // "Disgust",
    // "Sadness",
    // "Horror",
    // "Surprise (negative)",
  ];

  useEffect(() => {
    console.log("Mounting component");
    mountRef.current = true;
    console.log("Connecting to server");
    connect();

    return () => {
      console.log("Tearing down component");
      stopEverything();
    };
  }, []);

  function connect() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log("Socket already exists, will not create");
    } else {
      const baseUrl = getApiUrlWs(authContext.environment);
      const endpointUrl = `${baseUrl}/v0/stream/models`;
      const socketUrl = `${endpointUrl}?apikey=${authContext.key}`;
      console.log(`Connecting to websocket... (using ${endpointUrl})`);
      setStatus(`Connecting to server...`);

      const socket = new WebSocket(socketUrl);

      socket.onopen = socketOnOpen;
      socket.onmessage = socketOnMessage;
      socket.onclose = socketOnClose;
      socket.onerror = socketOnError;

      socketRef.current = socket;
    }
  }

  async function socketOnOpen() {
    console.log("Connected to websocket");
    setStatus("Connecting to webcam...");
    if (recorderRef.current) {
      console.log("Video recorder found, will use open socket");
      await capturePhoto();
    } else {
      console.warn("No video recorder exists yet to use with the open socket");
    }
  }


  // TODO: might need to modify onMessage to pass onto poker api call
  async function socketOnMessage(event: MessageEvent) {
    setStatus("");
    const response = JSON.parse(event.data);
    console.log("Got response", response);
    const predictions: FacePrediction[] = response.face?.predictions || [];
    const warning = response.face?.warning || "";
    const error = response.error;
    if (error) {
      setStatus(error);
      console.error(error);
      stopEverything();
      return;
    }

    if (predictions.length === 0) {
      setStatus(warning.replace(".", ""));
      setEmotions([]);
    }

    const newTrackedFaces: TrackedFace[] = [];
    predictions.forEach(async (pred: FacePrediction, dataIndex: number) => {
      newTrackedFaces.push({ boundingBox: pred.bbox });
      if (dataIndex === 0) {
        const newEmotions = pred.emotions;
        setEmotions(newEmotions);
        if (onCalibrate) {
          onCalibrate(newEmotions);
        }
      }
    });
    setTrackedFaces(newTrackedFaces);

    await capturePhoto();
  }

  async function socketOnClose(event: CloseEvent) {
    console.log("Socket closed");

    if (mountRef.current === true) {
      setStatus("Reconnecting");
      console.log("Component still mounted, will reconnect...");
      connect();
    } else {
      console.log("Component unmounted, will not reconnect...");
    }
  }

  async function socketOnError(event: Event) {
    console.error("Socket failed to connect: ", event);
    if (numReconnects.current >= maxReconnects) {
      setStatus(`Failed to connect to the Hume API (${authContext.environment}).
      Please log out and verify that your API key is correct.`);
      stopEverything();
    } else {
      numReconnects.current++;
      console.warn(`Connection attempt ${numReconnects.current}`);
    }
  }

  function stopEverything() {
    console.log("Stopping everything...");
    mountRef.current = false;
    const socket = socketRef.current;
    if (socket) {
      console.log("Closing socket");
      socket.close();
      socketRef.current = null;
    } else {
      console.warn("Could not close socket, not initialized yet");
    }
    const recorder = recorderRef.current;
    if (recorder) {
      console.log("Stopping recorder");
      recorder.stopRecording();
      recorderRef.current = null;
    } else {
      console.warn("Could not stop recorder, not initialized yet");
    }
  }

  async function onVideoReady(videoElement: HTMLVideoElement) {
    console.log("Video element is ready");

    if (!photoRef.current) {
      console.error("No photo element found");
      return;
    }

    if (!recorderRef.current && recorderCreated.current === false) {
      console.log("No recorder yet, creating one now");
      recorderCreated.current = true;
      const recorder = await VideoRecorder.create(videoElement, photoRef.current);

      recorderRef.current = recorder;
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Socket open, will use the new recorder");
        await capturePhoto();
      } else {
        console.warn("No socket available for sending photos");
      }
    }
  }

  async function capturePhoto() {
    const recorder = recorderRef.current;

    if (!recorder) {
      console.error("No recorder found");
      return;
    }

    const photoBlob = await recorder.takePhoto();
    sendRequest(photoBlob);
  }

  async function sendRequest(photoBlob: Blob) {
    const socket = socketRef.current;

    if (!socket) {
      console.error("No socket found");
      return;
    }

    const encodedBlob = await blobToBase64(photoBlob);
    const requestData = JSON.stringify({
      data: encodedBlob,
      models: {
        face: {},
      },
    });

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(requestData);
    } else {
      console.error("Socket connection not open. Will not capture a photo");
      socket.close();
    }
  }

  const openai = ""; // INSERT KEY
  async function handleSubmit(event: Event) {
    event.preventDefault();

    const riv1 = document.getElementById("river1") as HTMLInputElement;
    const riv2 = document.getElementById("river2") as HTMLInputElement;
    const riv3 = document.getElementById("river3") as HTMLInputElement;
    const riv4 = document.getElementById("river4") as HTMLInputElement;
    const riv5 = document.getElementById("river5") as HTMLInputElement;
    const card1 = document.getElementById("card1") as HTMLInputElement;
    const card2 = document.getElementById("card2") as HTMLInputElement;
    const pot = document.getElementById("pot_size") as HTMLInputElement;
    const play = document.getElementById("num_player") as HTMLInputElement;

    let userInput = "I'm playing poker and my hand is " + card1.value + " and " + card2.value
      + ". There are currently " + play.value + " players in the pot, which is worth " + pot.value + ". ";
    if (riv3 && riv3.value) { // flop
      userInput = userInput.concat("The flop revealed a "
        + riv1.value + ", " + riv2.value + ", " + riv3.value + ". ");
    }
    if (riv4 && riv4.value) { // turn
      userInput = userInput.concat("The turn revealed a "
      + ", " + riv4.value + ". ");
    }
    if (riv5 && riv5.value) { // river
      userInput = userInput.concat("The river revealed a "
        + ", " + riv5.value + ". ");
    }
    userInput = userInput.concat("What action would you recommend performing? If raise, by how much should I raise?");
    console.log(userInput);

    // Disable the button to prevent multiple submissions
    const submitButton = document.querySelector("button[type=submit]") as HTMLButtonElement;
    submitButton.disabled = true;
    console.log("Button clicked");

    try {
      const completion = true;
      // const completion = await openai.chat.completions.create({
      //   messages: [
      //     { role: "system", content: "You are a helpful assistant." },
      //     { role: "user", content: userInput }
      //   ],
      //   model: "gpt-4"
      // });

      const responseDiv = document.getElementById("response");
      // if (responseDiv) {
      //   responseDiv.textContent = completion.choices[0].message?.content ?? "No response";
      // }
    } catch (error) {
      console.error("Error fetching the completion:", error);
    } finally {
      // Re-enable the button after the request is complete
      submitButton.disabled = false;
    }
  }
  document.getElementById("openai-form")?.addEventListener("submit", handleSubmit);

  return (
    <div>
      <div className="md:flex">
        <FaceTrackedVideo
          className="mb-6"
          onVideoReady={onVideoReady}
          trackedFaces={trackedFaces}
          width={500}
          height={375}
        />
        {!onCalibrate && (
          <div className="ml-10">
            <TopEmotions emotions={emotions} />
            <LoaderSet
              className="mt-8 ml-5"
              emotionNames={loaderNames}
              emotions={emotions}
              numLevels={numLoaderLevels}
            />
            <Descriptor className="mt-8" emotions={emotions} />
          </div>
        )}
      </div>

      <div className="pt-6">{status}</div>
      <div className="pt-6">
        <form id="openai-form">
          <h1>Your current hand:</h1>
          <input class="border-solid" type="text" id="card1" name="card1" placeholder="Your 1st card..." required />
          <input class="border-solid" type="text" id="card2" name="card2" placeholder="Your 2nd card..." required />
          <br></br>
          <br></br>
          <h1>What's on the river:</h1>
          <input class="border-solid" type="text" id="river1" name="river1" placeholder="1st river..." />
          <input class="border-solid" type="text" id="river2" name="river2" placeholder="2nd river..." />
          <input class="border-solid" type="text" id="river3" name="river3" placeholder="3rd river..." />
          <input class="border-solid" type="text" id="river4" name="river4" placeholder="4th river..." />
          <input class="border-solid" type="text" id="river5" name="river5" placeholder="5th river..." />
          <br></br>
          <br></br>
          <h1>What's the pot size / how many players are in:</h1>
          <input class="border-solid" type="text" id="pot_size" name="pot_size" placeholder="Pot size..." required />
          <input class="border-solid" type="text" id="num_player" name="num_player" placeholder="Number of players..." required />

          <button type="submit" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded my-5">
          Ask GPT
          </button>
        </form>
        <div id="response"></div>
      </div>
      <canvas className="hidden" ref={photoRef}></canvas>
    </div>
  );
}

FaceWidgets.defaultProps = {
  onCalibrate: None,
};
