import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";
import SafetyMap from "./SafetyMap";
import AlexaSimulator from "./AlexaSimulator";
import BeaconHome from "./BeaconHome";

const socket = io("http://localhost:5000");

function App() {
  const params = new URLSearchParams(
    window.location.search
  );

  const role =
    params.get("role") || "victim";

  const mode =
    params.get("mode");

  const responderName =
    params.get("name") || "House A";

  const hasExplicitRole =
    params.has("role");

  const [sosActive, setSosActive] =
    useState(false);

  const [location, setLocation] =
    useState(null);

  const [
    locationStatus,
    setLocationStatus,
  ] = useState("");

  const [responders, setResponders] =
    useState([]);

  const [
    emergencyAlert,
    setEmergencyAlert,
  ] = useState(null);

  const [
    liveVictimLocation,
    setLiveVictimLocation,
  ] = useState(null);

  const [
  responderLocation,
  setResponderLocation,
] = useState(null);

  const [
    securityResponding,
    setSecurityResponding,
  ] = useState(false);

  const [
    guardResponding,
    setGuardResponding,
  ] = useState(false);

  const [
    incidentResolved,
    setIncidentResolved,
  ] = useState(false);

  const [
    soundEnabled,
    setSoundEnabled,
  ] = useState(false);

  const audioContextRef =
    useRef(null);

  const sirenOscillatorRef =
    useRef(null);

  const sirenIntervalRef =
    useRef(null);

  // --------------------------------
  // SOCKET.IO CONNECTIONS
  // --------------------------------

  useEffect(() => {
    function registerResponder() {
      console.log(
        "Socket connected:",
        socket.id
      );

      if (
        role === "neighbor" ||
        role === "security"
      ) {
        console.log(
          "Registering responder:",
          responderName
        );

        socket.emit(
          "register-responder",
          {
            name: responderName,
          }
        );
      }
    }

    function handleEmergencyAlert(data) {
      console.log(
        "Emergency received:",
        data
      );

      if (
        role === "neighbor" ||
        role === "security"
      ) {
        setEmergencyAlert(data);

        setLiveVictimLocation(
          data.victimLocation || null
        );

        setResponderLocation(
  data.responderLocation || null
);

        setIncidentResolved(false);
      }
    }

    function handleSecurityResponse(
      data
    ) {
      console.log(
        "SECURITY RESPONSE ARRIVED:",
        data
      );

      if (role === "victim") {
        setSecurityResponding(true);
      }
    }

    function handleIncidentResolved(
      data
    ) {
      console.log(
        "INCIDENT RESOLVED RECEIVED:",
        data
      );

      setIncidentResolved(true);

      setEmergencyAlert(null);

      setLiveVictimLocation(null);

      setResponderLocation(null);

      setGuardResponding(false);

      setSecurityResponding(false);

      setResponders([]);

      stopSiren();
    }

    function handleVictimLocationUpdate(
      location
    ) {
      console.log(
        "LIVE VICTIM LOCATION RECEIVED:",
        location
      );

      if (
        role === "neighbor" ||
        role === "security"
      ) {
        setLiveVictimLocation(
          location
        );
      }
    }

    if (socket.connected) {
      registerResponder();
    }

    socket.on(
      "connect",
      registerResponder
    );

    socket.on(
      "emergency-alert",
      handleEmergencyAlert
    );

    socket.on(
      "security-response",
      handleSecurityResponse
    );

    socket.on(
      "incident-resolved",
      handleIncidentResolved
    );

    socket.on(
      "victim-location-update",
      handleVictimLocationUpdate
    );

    return () => {
      socket.off(
        "connect",
        registerResponder
      );

      socket.off(
        "emergency-alert",
        handleEmergencyAlert
      );

      socket.off(
        "security-response",
        handleSecurityResponse
      );

      socket.off(
        "incident-resolved",
        handleIncidentResolved
      );

      socket.off(
        "victim-location-update",
        handleVictimLocationUpdate
      );
    };
  }, [role, responderName]);

  // --------------------------------
  // AUTOMATIC SIREN
  // --------------------------------

  useEffect(() => {
    if (
      role === "neighbor" &&
      emergencyAlert &&
      soundEnabled
    ) {
      startSiren();
    }

    return () => {
      stopSiren();
    };
  }, [
    emergencyAlert,
    soundEnabled,
    role,
  ]);

  // --------------------------------
  // AUDIO FUNCTIONS
  // --------------------------------

  function enableEmergencySound() {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      alert(
        "Emergency audio is not supported in this browser."
      );

      return;
    }

    if (
      !audioContextRef.current
    ) {
      audioContextRef.current =
        new AudioContext();
    }

    audioContextRef.current.resume();

    setSoundEnabled(true);
  }

  function startSiren() {
    if (
      !soundEnabled ||
      !audioContextRef.current
    ) {
      return;
    }

    if (
      sirenOscillatorRef.current
    ) {
      return;
    }

    const context =
      audioContextRef.current;

    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    oscillator.type = "sine";

    oscillator.frequency.setValueAtTime(
      700,
      context.currentTime
    );

    gain.gain.setValueAtTime(
      0.08,
      context.currentTime
    );

    oscillator.connect(gain);

    gain.connect(
      context.destination
    );

    oscillator.start();

    sirenOscillatorRef.current =
      oscillator;

    let highTone = false;

    sirenIntervalRef.current =
      setInterval(() => {
        highTone = !highTone;

        oscillator.frequency.setValueAtTime(
          highTone ? 1000 : 700,
          context.currentTime
        );
      }, 500);
  }

  function stopSiren() {
    if (
      sirenIntervalRef.current
    ) {
      clearInterval(
        sirenIntervalRef.current
      );

      sirenIntervalRef.current =
        null;
    }

    if (
      sirenOscillatorRef.current
    ) {
      try {
        sirenOscillatorRef.current.stop();
      } catch {
        // already stopped
      }

      sirenOscillatorRef.current =
        null;
    }
  }

  // --------------------------------
  // DISTANCE CALCULATION
  // --------------------------------

  function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
  ) {
    const earthRadius =
      6371000;

    const toRadians =
      (degrees) =>
        (degrees * Math.PI) /
        180;

    const dLat =
      toRadians(
        lat2 - lat1
      );

    const dLon =
      toRadians(
        lon2 - lon1
      );

    const a =
      Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
      Math.cos(
        toRadians(lat1)
      ) *
        Math.cos(
          toRadians(lat2)
        ) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return (
      earthRadius * c
    );
  }

  function createDemoLocation(
    latitude,
    longitude,
    distanceMeters,
    bearingDegrees
  ) {
    const earthRadius =
      6371000;

    const angularDistance =
      distanceMeters /
      earthRadius;

    const bearing =
      (bearingDegrees *
        Math.PI) /
      180;

    const lat1 =
      (latitude *
        Math.PI) /
      180;

    const lon1 =
      (longitude *
        Math.PI) /
      180;

    const lat2 =
      Math.asin(
        Math.sin(lat1) *
          Math.cos(
            angularDistance
          ) +
          Math.cos(lat1) *
            Math.sin(
              angularDistance
            ) *
            Math.cos(
              bearing
            )
      );

    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) *
          Math.sin(
            angularDistance
          ) *
          Math.cos(lat1),

        Math.cos(
          angularDistance
        ) -
          Math.sin(lat1) *
            Math.sin(lat2)
      );

    return {
      latitude:
        (lat2 * 180) /
        Math.PI,

      longitude:
        (lon2 * 180) /
        Math.PI,
    };
  }

  function findNearbyResponders(
    userLocation
  ) {
    const demoResponders = [
      {
        name: "House A",
        type:
          "Verified Household",
        distanceTarget: 80,
        bearing: 45,
      },

      {
        name: "House B",
        type:
          "Verified Household",
        distanceTarget: 140,
        bearing: 135,
      },

      {
        name:
          "Security Guard",
        type:
          "Verified Security",
        distanceTarget: 190,
        bearing: 225,
      },

      {
        name: "House C",
        type:
          "Verified Household",
        distanceTarget: 230,
        bearing: 315,
      },

      {
        name: "House D",
        type:
          "Verified Household",
        distanceTarget: 420,
        bearing: 90,
      },
    ];

    const results =
      demoResponders.map(
        (responder) => {
          const demoLocation =
            createDemoLocation(
              userLocation.latitude,
              userLocation.longitude,
              responder.distanceTarget,
              responder.bearing
            );

          const calculatedDistance =
            calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              demoLocation.latitude,
              demoLocation.longitude
            );

          return {
            ...responder,

            latitude:
              demoLocation.latitude,

            longitude:
              demoLocation.longitude,

            distance:
              Math.round(
                calculatedDistance
              ),

            insideRadius:
              calculatedDistance <=
              250,
          };
        }
      );

    setResponders(results);

    return results;
  }

  // --------------------------------
  // LEGACY VICTIM SOS
  // --------------------------------

  function triggerSOS() {
    setSosActive(true);

    setIncidentResolved(false);

    setSecurityResponding(false);

    setLocationStatus(
      "Getting your location..."
    );

    if (
      !navigator.geolocation
    ) {
      setLocationStatus(
        "Location is not supported on this device."
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = {
          latitude:
            position.coords
              .latitude,

          longitude:
            position.coords
              .longitude,

          accuracy:
            position.coords
              .accuracy,
        };

        setLocation(
          userLocation
        );

        setLocationStatus(
          "Location acquired successfully"
        );

        const responderResults =
          findNearbyResponders(
            userLocation
          );

        const nearbyResponders =
          responderResults.filter(
            (responder) =>
              responder.insideRadius
          );

        socket.emit(
          "trigger-sos",
          {
            location:
              userLocation,

            nearbyResponders,
          }
        );
      },

      (error) => {
        console.error(
          error
        );

        if (
          error.code === 1
        ) {
          setLocationStatus(
            "Location permission was denied."
          );
        } else if (
          error.code === 2
        ) {
          setLocationStatus(
            "Location is currently unavailable."
          );
        } else if (
          error.code === 3
        ) {
          setLocationStatus(
            "Location request timed out. Please try again."
          );
        } else {
          setLocationStatus(
            "Unable to get location."
          );
        }
      },

      {
        enableHighAccuracy:
          true,

        timeout: 20000,

        maximumAge: 0,
      }
    );
  }

  // --------------------------------
  // UNIFIED BEACON250 HOME
  // --------------------------------

  if (
    !mode &&
    !hasExplicitRole
  ) {
    return <BeaconHome />;
  }

  // --------------------------------
  // ALEXA+ SIMULATOR SCREEN
  // --------------------------------

  if (
    mode === "alexa"
  ) {
    return (
      <AlexaSimulator />
    );
  }

  // --------------------------------
  // SECURITY GUARD SCREEN
  // --------------------------------

  if (
    role === "security"
  ) {
    return (
      <div
        className={
          emergencyAlert
            ? "securityPage securityEmergency"
            : "securityPage"
        }
      >
        {!emergencyAlert ? (
          <>
            <div className="logo">
              B250
            </div>

            <h1>
              Beacon250
            </h1>

            <h2>
              🛡️ Security Guard
            </h2>

            <p className="neighborWaiting">
              Waiting for nearby
              emergencies...
            </p>

            <div className="systemStatus">
              <span className="statusDot"></span>
              Security connected
            </div>
          </>
        ) : (
          <>
            <div className="bigAlertIcon">
              🚨
            </div>

            <h1>
              SECURITY ALERT
            </h1>

            <p className="alertMessage">
              A person nearby has
              requested emergency
              assistance.
            </p>

            <div className="neighborDistance">
              Approximately{" "}
              {
                emergencyAlert.distance
              }{" "}
              metres away
            </div>

            {liveVictimLocation && (
              <div
                style={{
                  marginTop:
                    "20px",

                  width:
                    "100%",
                }}
              >
                <SafetyMap
  latitude={liveVictimLocation.latitude}
  longitude={liveVictimLocation.longitude}
  responderLocation={responderLocation}
/>
              </div>
            )}

            {!guardResponding ? (
              <button
                className="respondButton"
                onClick={() => {
                  setGuardResponding(
                    true
                  );

                  socket.emit(
                    "security-responding",
                    {
                      name:
                        responderName,
                    }
                  );
                }}
              >
                🛡️ RESPONDING
              </button>
            ) : (
              <div className="respondingConfirmed">
                ✓ Response
                confirmed
                <br />
                Proceed safely
                toward the
                incident.
              </div>
            )}

            <p className="privacyMessage">
              Live victim
              location is shared
              only during the
              active emergency.
            </p>
          </>
        )}
      </div>
    );
  }

  // --------------------------------
  // NEIGHBOR SCREEN
  // --------------------------------

  if (
    role === "neighbor"
  ) {
    return (
      <div
        className={
          emergencyAlert
            ? "neighborPage neighborEmergency"
            : "neighborPage"
        }
      >
        {!emergencyAlert ? (
          <>
            <div className="logo">
              B250
            </div>

            <h1>
              Beacon250
            </h1>

            <h2>
              {responderName}
            </h2>

            <p>
              Verified Household
            </p>

            <p className="neighborWaiting">
              Waiting for nearby
              safety alerts...
            </p>

            {!soundEnabled ? (
              <button
                className="enableAlertButton"
                onClick={
                  enableEmergencySound
                }
              >
                🔊 Enable
                Emergency Alerts
              </button>
            ) : (
              <p className="soundReady">
                🔊 Emergency
                sound enabled
              </p>
            )}

            <div className="systemStatus">
              <span className="statusDot"></span>
              Connected to
              Beacon250
            </div>
          </>
        ) : (
          <>
            <div className="bigAlertIcon">
              🚨
            </div>

            <h1 className="alertTitle">
              SAFETY ALERT
            </h1>

            <p className="alertMessage">
              A person has
              requested emergency
              assistance nearby.
            </p>

            <div className="neighborDistance">
              Approximately{" "}
              {
                emergencyAlert.distance
              }{" "}
              metres away
            </div>

            {liveVictimLocation && (
              <div
                style={{
                  marginTop:
                    "20px",

                  width:
                    "100%",
                }}
              >
               <SafetyMap
  latitude={liveVictimLocation.latitude}
  longitude={liveVictimLocation.longitude}
  responderLocation={responderLocation}
/>
              </div>
            )}

            <div className="alertActions">
              <button
                className="muteButton"
                onClick={
                  stopSiren
                }
              >
                🔇 Mute Alarm
              </button>

              <button className="lightButton">
                💡 Turn Lights
                On
              </button>

              <button
                className="callButton"
                onClick={() => {
                  window.location.href =
                    "tel:112";
                }}
              >
                📞 Call 112
              </button>

              <button className="observeButton">
                👀 Observe
                Safely
              </button>
            </div>

            <p className="privacyMessage">
              Live victim
              location is shared
              only during the
              active emergency.
            </p>
          </>
        )}
      </div>
    );
  }

  // --------------------------------
  // LEGACY VICTIM SCREEN
  // --------------------------------

  return (
    <div className="app">
      <div className="logo">
        B250
      </div>

      <h1>
        Beacon250
      </h1>

      <p className="tagline">
        Help is already nearby.
      </p>

      {!sosActive ? (
        <>
          <button
            className="sosButton"
            onClick={
              triggerSOS
            }
          >
            SOS
          </button>

          <p className="instruction">
            Tap for emergency
            assistance
          </p>

          <div className="systemStatus">
            <span className="statusDot"></span>
            Safety system ready
          </div>
        </>
      ) : (
        <div className="activeEmergency">
          {!incidentResolved && (
            <button
              className="safeButton"
              onClick={() => {
                socket.emit(
                  "incident-resolved"
                );

                setIncidentResolved(
                  true
                );
              }}
            >
              ✓ I'M SAFE
            </button>
          )}

          {incidentResolved && (
            <div className="resolvedCard">
              <div className="resolvedIcon">
                ✓
              </div>

              <div>
                <strong>
                  INCIDENT
                  RESOLVED
                </strong>

                <p>
                  Emergency
                  alerts have
                  been closed.
                </p>
              </div>
            </div>
          )}

          <div className="alertIcon">
            🚨
          </div>

          <h2>
            {incidentResolved
              ? "INCIDENT RESOLVED"
              : "SOS ACTIVE"}
          </h2>

          <p>
            {incidentResolved
              ? "Emergency alerts have been closed."
              : "Emergency alert initiated."}
          </p>

          <p>
            {locationStatus}
          </p>

          {securityResponding && (
            <div className="securityResponseCard">
              <div className="securityIcon">
                🛡️
              </div>

              <div>
                <strong>
                  SECURITY
                  RESPONDING
                </strong>

                <p>
                  Help is on
                  the way.
                </p>
              </div>
            </div>
          )}

          {location && (
            <div className="locationCard">
              <strong>
                📍 Victim
                location
                acquired
              </strong>

              <p>
                GPS accuracy:{" "}
                {Math.round(
                  location.accuracy
                )}{" "}
                metres
              </p>
            </div>
          )}

          {location &&
            !incidentResolved && (
              <div
                style={{
                  marginTop:
                    "20px",
                }}
              >
                <SafetyMap
                  latitude={
                    location.latitude
                  }
                  longitude={
                    location.longitude
                  }
                  responders={
                    responders
                  }
                />
              </div>
            )}

          {responders.length >
            0 &&
            !incidentResolved && (
              <div className="respondersSection">
                <h3>
                  250m Safety
                  Radius
                </h3>

                {responders.map(
                  (
                    responder,
                    index
                  ) => (
                    <div
                      key={
                        index
                      }
                      className={
                        responder.insideRadius
                          ? "responderCard nearby"
                          : "responderCard tooFar"
                      }
                    >
                      <div>
                        <strong>
                          {
                            responder.name
                          }
                        </strong>

                        <p>
                          {
                            responder.type
                          }
                        </p>
                      </div>

                      <div className="distanceInfo">
                        <strong>
                          {
                            responder.distance
                          }{" "}
                          m
                        </strong>

                        <span>
                          {responder.insideRadius
                            ? "✅ ALERT"
                            : "❌ TOO FAR"}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export default App;