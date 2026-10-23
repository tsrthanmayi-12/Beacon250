import { useState } from "react";

function AlexaSimulator({
  requesterName,
  onEmergencyActivated,
}) {
  const [command, setCommand] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);

  const getCurrentLocation = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error(
            "Geolocation is not supported."
          )
        );
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude:
              position.coords.latitude,

            longitude:
              position.coords.longitude,

            accuracy:
              position.coords.accuracy,
          });
        },

        (error) => {
          reject(error);
        },

        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }
      );
    });

  const sendCommand = async (
    spokenCommand = command
  ) => {
    const finalCommand =
      String(spokenCommand || "").trim();

    if (!finalCommand) {
      return;
    }

    setCommand(finalCommand);
    setLoading(true);
    setResponse("");

    try {
      const lowerCommand =
        finalCommand.toLowerCase();

      const emergencyWords = [
        "help",
        "sos",
        "emergency",
        "unsafe",
        "danger",
        "save me",
        "followed",
        "following me",
        "need help",
      ];

      const isEmergency =
        emergencyWords.some((word) =>
          lowerCommand.includes(word)
        );

      let currentLocation = null;

      if (isEmergency) {
        setResponse(
          "Getting your emergency location..."
        );

        currentLocation =
          await getCurrentLocation();
      }

      /*
        IMPORTANT:
        Use the same deterministic emergency
        command as the working SOS flow.

        We still display the user's actual
        spoken command in the Alexa UI.
      */
      const gatewayCommand =
        isEmergency
          ? "SOS emergency help"
          : finalCommand;

      const result = await fetch(
        "https://beacon250-alexa-gateway.onrender.com/alexa-command",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            text: gatewayCommand,

            latitude:
              currentLocation?.latitude,

            longitude:
              currentLocation?.longitude,

            requesterName:
              requesterName || "House A",
          }),
        }
      );

      if (!result.ok) {
        const errorText =
          await result.text();

        throw new Error(
          `Alexa gateway error ${result.status}: ${errorText}`
        );
      }

      const data =
        await result.json();

      setResponse(
        data.response ||
          "Beacon250 request processed."
      );

      /*
        Only activate the victim UI when
        this was actually an emergency.

        Reuse the location we already obtained.
        Do NOT request geolocation a second time.
      */
      if (
        isEmergency &&
        currentLocation &&
        onEmergencyActivated
      ) {
        onEmergencyActivated(
          currentLocation,
          data.response ||
            "Beacon250 emergency network activated."
        );
      }
    } catch (error) {
      console.error(
        "Alexa command error:",
        error
      );

      setResponse(
        "I could not connect to Beacon250 or access your location."
      );
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setResponse(
        "Voice recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge."
      );

      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);

      setResponse(
        'Listening... say "Alexa, I need help"'
      );
    };

    recognition.onresult = (event) => {
      const transcript =
        event.results?.[0]?.[0]
          ?.transcript || "";

      console.log(
        "Voice command:",
        transcript
      );

      setCommand(transcript);

      sendCommand(transcript);
    };

    recognition.onerror = (event) => {
      console.error(
        "Speech recognition error:",
        event.error
      );

      if (
        event.error ===
        "not-allowed"
      ) {
        setResponse(
          "Microphone permission is blocked. Please allow microphone access in your browser."
        );
      } else if (
        event.error ===
        "no-speech"
      ) {
        setResponse(
          'No speech detected. Please try again and say "Alexa, I need help".'
        );
      } else {
        setResponse(
          "I could not understand the voice command. Please try again."
        );
      }

      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    try {
      recognition.start();
    } catch (error) {
      console.error(
        "Could not start speech recognition:",
        error
      );

      setListening(false);

      setResponse(
        "Voice recognition could not start. Please try again or use the text command."
      );
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",

        background:
          "linear-gradient(135deg, #07111f, #102a43)",

        color: "white",

        display: "flex",

        justifyContent: "center",

        alignItems: "center",

        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "420px",

          padding: "40px",

          borderRadius: "24px",

          background:
            "rgba(255,255,255,0.08)",

          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "54px",
            marginBottom: "10px",
          }}
        >
          ✨
        </div>

        <h1>Alexa+</h1>

        <p
          style={{
            opacity: 0.7,
            marginBottom: "30px",
          }}
        >
          Beacon250 Emergency Assistant
        </p>

        <button
          onClick={startListening}
          disabled={
            listening || loading
          }
          style={{
            width: "100%",

            padding: "18px",

            border: "none",

            borderRadius: "14px",

            fontSize: "17px",

            fontWeight: "bold",

            cursor:
              listening || loading
                ? "wait"
                : "pointer",

            marginBottom: "15px",
          }}
        >
          {listening
            ? "🎙 Listening..."
            : "🎙 Speak to Alexa+"}
        </button>

        <input
          value={command}
          onChange={(event) =>
            setCommand(
              event.target.value
            )
          }
          onKeyDown={(event) => {
            if (
              event.key ===
                "Enter" &&
              !loading
            ) {
              sendCommand();
            }
          }}
          placeholder='Or type "Alexa, I need help"'
          style={{
            width: "100%",

            boxSizing:
              "border-box",

            padding: "15px",

            borderRadius: "12px",

            border: "none",

            fontSize: "16px",

            marginBottom: "15px",
          }}
        />

        <button
          onClick={() =>
            sendCommand()
          }
          disabled={loading}
          style={{
            width: "100%",

            padding: "15px",

            border: "none",

            borderRadius: "12px",

            fontWeight: "bold",

            fontSize: "16px",

            cursor: loading
              ? "wait"
              : "pointer",
          }}
        >
          {loading
            ? "Processing..."
            : "Send to Alexa+"}
        </button>

        {response && (
          <div
            style={{
              marginTop: "25px",

              padding: "18px",

              background:
                "rgba(255,255,255,0.1)",

              borderRadius: "12px",

              lineHeight: "1.5",
            }}
          >
            <strong>
              Alexa+
            </strong>

            <p>{response}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AlexaSimulator;