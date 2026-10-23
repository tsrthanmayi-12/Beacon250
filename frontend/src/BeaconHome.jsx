import {
  useEffect,
  useRef,
  useState,
} from "react";

import AlexaSimulator from "./AlexaSimulator";
import SafetyMap from "./SafetyMap";
import "./BeaconHome.css";

import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

function BeaconHome() {
  const [activeTab, setActiveTab] =
    useState("home");

  const [showAlexa, setShowAlexa] =
    useState(false);

  const [sosLoading, setSosLoading] =
    useState(false);

  const [sosMessage, setSosMessage] =
    useState("");

  const [
    emergencyActive,
    setEmergencyActive,
  ] = useState(false);

  const [
    emergencyLocation,
    setEmergencyLocation,
  ] = useState(null);

  const [
    securityResponding,
    setSecurityResponding,
  ] = useState(false);

  const [
    responderResponses,
    setResponderResponses,
  ] = useState([]);

  const [
    hasAcknowledgedResponse,
    setHasAcknowledgedResponse,
  ] = useState(false);

  const [
    nearbyAlert,
    setNearbyAlert,
  ] = useState(null);

  const [
    nearbyVictimLocation,
    setNearbyVictimLocation,
  ] = useState(null);

  const [
    nearbyResponderLocation,
    setNearbyResponderLocation,
  ] = useState(null);

  const [
    soundEnabled,
    setSoundEnabled,
  ] = useState(false);

  const [
    sirenMuted,
    setSirenMuted,
  ] = useState(false);

  const [
    homeMapLocation,
    setHomeMapLocation,
  ] = useState(null);

  const [
    homeMapStatus,
    setHomeMapStatus,
  ] = useState("Location not loaded");

  const [
    homeMapLoading,
    setHomeMapLoading,
  ] = useState(false);

  const audioContextRef =
    useRef(null);

  const sirenOscillatorRef =
    useRef(null);

  const sirenIntervalRef =
    useRef(null);

  // ==================================================
  // DEMO SIGN-IN / CURRENT USER
  // ==================================================

  const params = new URLSearchParams(
    window.location.search
  );

  const profile = params.get("profile");
  const requestedName = params.get("name");

  const demoProfiles = [
    {
      name: "House A",
      type: "Verified Household",
      icon: "🏠",
      description: "Primary resident demo account",
    },
    {
      name: "House B",
      type: "Verified Household",
      icon: "🏡",
      description: "Nearby household responder",
    },
    {
      name: "Security Guard",
      type: "Verified Security",
      icon: "🛡️",
      description: "Verified security responder",
    },
  ];

  const [selectedProfile, setSelectedProfile] = useState(() => {
    // Preserve the existing direct demo URLs.
    if (profile === "security") {
      return {
        name: "Security Guard",
        type: "Verified Security",
      };
    }

    if (requestedName) {
      return {
        name: requestedName,
        type: "Verified Household",
      };
    }

    try {
      const savedProfile = localStorage.getItem(
        "beacon250_demo_profile"
      );

      return savedProfile
        ? JSON.parse(savedProfile)
        : null;
    } catch {
      return null;
    }
  });

  const currentUser = selectedProfile || {
    name: "Demo Guest",
    type: "Unverified Demo",
  };

  function signInDemo(profileToUse) {
    const safeProfile = {
      name: profileToUse.name,
      type: profileToUse.type,
    };

    localStorage.setItem(
      "beacon250_demo_profile",
      JSON.stringify(safeProfile)
    );

    window.history.replaceState(
      {},
      "",
      window.location.pathname
    );

    setActiveTab("home");
    setSelectedProfile(safeProfile);
  }

  function signOutDemo() {
    if (emergencyActive || nearbyAlert) {
      alert(
        "Please resolve the active emergency before signing out."
      );
      return;
    }

    localStorage.removeItem(
      "beacon250_demo_profile"
    );

    window.history.replaceState(
      {},
      "",
      window.location.pathname
    );

    setActiveTab("home");
    setShowAlexa(false);
    setHomeMapLocation(null);
    setHomeMapStatus("Location not loaded");
    setSelectedProfile(null);
  }

  // ==================================================
  // CREATE DEMO RESPONDER LOCATION
  // ==================================================

  function createResponderPoint(
    latitude,
    longitude,
    distanceMetres,
    bearingDegrees
  ) {
    const earthRadius = 6371000;

    const bearing =
      (bearingDegrees * Math.PI) / 180;

    const lat1 =
      (latitude * Math.PI) / 180;

    const lon1 =
      (longitude * Math.PI) / 180;

    const angularDistance =
      distanceMetres / earthRadius;

    const lat2 = Math.asin(
      Math.sin(lat1) *
        Math.cos(angularDistance) +
        Math.cos(lat1) *
          Math.sin(angularDistance) *
          Math.cos(bearing)
    );

    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) *
          Math.sin(angularDistance) *
          Math.cos(lat1),

        Math.cos(angularDistance) -
          Math.sin(lat1) *
            Math.sin(lat2)
      );

    return {
      latitude:
        (lat2 * 180) / Math.PI,

      longitude:
        (lon2 * 180) / Math.PI,
    };
  }

  // ==================================================
  // REGISTER USER AS RESPONDER
  // ==================================================

  useEffect(() => {
    if (!selectedProfile) {
      // Disconnecting removes any old Socket.IO room memberships,
      // which prevents one browser from remaining registered as a
      // previously selected demo identity after sign-out.
      if (socket.connected) {
        socket.disconnect();
      }
      return;
    }

    const registerUnifiedResponder = () => {
      console.log(
        "Registering unified Beacon250 user:",
        selectedProfile.name
      );

      socket.emit("register-responder", {
        name: selectedProfile.name,
      });
    };

    socket.on("connect", registerUnifiedResponder);

    if (!socket.connected) {
      socket.connect();
    } else {
      registerUnifiedResponder();
    }

    return () => {
      socket.off(
        "connect",
        registerUnifiedResponder
      );
    };
  }, [selectedProfile?.name]);

  // ==================================================
  // RECEIVE NEARBY EMERGENCY
  // ==================================================

  useEffect(() => {
    function handleNearbyEmergency(
      data
    ) {
      // If this user is currently
      // the victim, never show
      // responder mode.
      if (emergencyActive) {
        return;
      }

      console.log(
        "NEARBY EMERGENCY RECEIVED:",
        data
      );

      setNearbyAlert(data);

      setSirenMuted(false);

      setHasAcknowledgedResponse(false);

      setNearbyVictimLocation(
        data.victimLocation || null
      );

      // --------------------------------
      // SECURITY LOCATION FIX
      // --------------------------------
      // For the security demo profile,
      // build a location approximately
      // the advertised distance away
      // from the victim.
      //
      // This prevents the map from
      // showing a 20+ km route while
      // the alert says 190 m.
      // --------------------------------

      if (
        currentUser.type ===
          "Verified Security" &&
        data.victimLocation
      ) {
        const securityLocation =
          createResponderPoint(
            data.victimLocation
              .latitude,

            data.victimLocation
              .longitude,

            data.distance || 190,

            225
          );

        setNearbyResponderLocation(
          securityLocation
        );
      } else {
        setNearbyResponderLocation(
          data.responderLocation ||
            null
        );
      }
    }

    function handleNearbyVictimLocation(
      location
    ) {
      if (emergencyActive) {
        return;
      }

      console.log(
        "UNIFIED USER RECEIVED LIVE VICTIM LOCATION:",
        location
      );

      setNearbyVictimLocation(
        location
      );
    }

    function handleNearbyIncidentResolved() {
      console.log(
        "Nearby incident resolved"
      );

      setNearbyAlert(null);

      setNearbyVictimLocation(
        null
      );

      setNearbyResponderLocation(
        null
      );

      setSirenMuted(false);

      setSecurityResponding(false);

      setResponderResponses([]);

      setHasAcknowledgedResponse(false);
    }

    socket.on(
      "emergency-alert",
      handleNearbyEmergency
    );

    socket.on(
      "victim-location-update",
      handleNearbyVictimLocation
    );

    socket.on(
      "incident-resolved",
      handleNearbyIncidentResolved
    );

    return () => {
      socket.off(
        "emergency-alert",
        handleNearbyEmergency
      );

      socket.off(
        "victim-location-update",
        handleNearbyVictimLocation
      );

      socket.off(
        "incident-resolved",
        handleNearbyIncidentResolved
      );
    };
  }, [emergencyActive, currentUser.type]);

  // ==================================================
  // SECURITY RESPONSE LISTENER
  // ==================================================

  useEffect(() => {
    const handleSecurityResponse =
      () => {
        setSecurityResponding(true);
      };

    socket.on(
      "security-response",
      handleSecurityResponse
    );

    return () => {
      socket.off(
        "security-response",
        handleSecurityResponse
      );
    };
  }, []);

  // ==================================================
  // HOUSEHOLD RESPONDER LISTENER
  // ==================================================

  useEffect(() => {
    function handleResponderResponse(data) {
      console.log(
        "HOUSEHOLD RESPONDER RESPONSE:",
        data
      );

      setResponderResponses(
        (previousResponses) => {
          const alreadyAdded =
            previousResponses.some(
              (responder) =>
                responder.name === data.name
            );

          if (alreadyAdded) {
            return previousResponses;
          }

          return [
            ...previousResponses,
            data,
          ];
        }
      );
    }

    socket.on(
      "responder-response",
      handleResponderResponse
    );

    return () => {
      socket.off(
        "responder-response",
        handleResponderResponse
      );
    };
  }, []);

  // ==================================================
  // LIVE VICTIM GPS TRACKING
  // ==================================================

  useEffect(() => {
    if (!emergencyActive) {
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    console.log(
      "Starting live victim tracking"
    );

    const watchId =
      navigator.geolocation.watchPosition(
        (position) => {
          const liveLocation = {
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

          setEmergencyLocation(
            liveLocation
          );

          socket.emit(
            "victim-location-update",
            liveLocation
          );

          console.log(
            "Live location sent:",
            liveLocation
          );
        },

        (error) => {
          console.error(
            "Live location error:",
            error
          );
        },

        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        }
      );

    return () => {
      navigator.geolocation.clearWatch(
        watchId
      );

      console.log(
        "Live victim tracking stopped"
      );
    };
  }, [emergencyActive]);

  // ==================================================
  // NORMAL MAP LOCATION
  // ==================================================

  function loadHomeMapLocation() {
    if (!navigator.geolocation) {
      setHomeMapStatus(
        "Location is not supported on this device."
      );
      return;
    }

    setHomeMapLoading(true);
    setHomeMapStatus(
      "Locating your current safety zone..."
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHomeMapLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });

        setHomeMapStatus(
          "Current location ready"
        );
        setHomeMapLoading(false);
      },
      (error) => {
        console.error(
          "Home map location error:",
          error
        );

        if (error.code === 1) {
          setHomeMapStatus(
            "Location permission was denied. Allow location access to view your safety map."
          );
        } else if (error.code === 2) {
          setHomeMapStatus(
            "Your current location is unavailable. Please try again."
          );
        } else if (error.code === 3) {
          setHomeMapStatus(
            "Location request timed out. Please try again."
          );
        } else {
          setHomeMapStatus(
            "Unable to load your current location."
          );
        }

        setHomeMapLoading(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );
  }

  useEffect(() => {
    if (
      activeTab === "map" &&
      !homeMapLocation
    ) {
      loadHomeMapLocation();
    }
  }, [activeTab]);

  // ==================================================
  // EMERGENCY SOUND
  // ==================================================

  function enableEmergencySound() {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      alert(
        "Emergency sound is not supported in this browser."
      );

      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current =
        new AudioContext();
    }

    audioContextRef.current.resume();

    setSoundEnabled(true);
  }

  function startSiren() {
    if (
      !soundEnabled ||
      !audioContextRef.current ||
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

    oscillator.frequency
      .setValueAtTime(
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

        oscillator.frequency
          .setValueAtTime(
            highTone
              ? 1000
              : 700,

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
        sirenOscillatorRef.current
          .stop();
      } catch {
        // already stopped
      }

      sirenOscillatorRef.current =
        null;
    }
  }

  useEffect(() => {
    if (
      nearbyAlert &&
      soundEnabled &&
      !emergencyActive &&
      !sirenMuted
    ) {
      startSiren();
    } else {
      stopSiren();
    }

    return () => {
      stopSiren();
    };
  }, [
    nearbyAlert,
    soundEnabled,
    emergencyActive,
    sirenMuted,
  ]);

  // ==================================================
  // TRIGGER SOS FROM HOME
  // ==================================================

  const triggerHomeSOS =
    async () => {
      if (
        !navigator.geolocation
      ) {
        setSosMessage(
          "Location is not supported on this device."
        );

        return;
      }

      // Clear any old responder alert.

      setNearbyAlert(null);

      setNearbyVictimLocation(
        null
      );

      setNearbyResponderLocation(
        null
      );

      setSirenMuted(false);

      setResponderResponses([]);

      setHasAcknowledgedResponse(false);

      setSosLoading(true);

      setSosMessage(
        "Getting your emergency location..."
      );

      navigator.geolocation
        .getCurrentPosition(
          async (position) => {
            try {
              const victimLocation =
                {
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

              setEmergencyLocation(
                victimLocation
              );

              // IMPORTANT:
              // mark this user as victim
              // before backend alerts arrive.

              setEmergencyActive(
                true
              );

              setSecurityResponding(
                false
              );

              const result =
                await fetch(
                  "http://localhost:5002/alexa-command",
                  {
                    method:
                      "POST",

                    headers: {
                      "Content-Type":
                        "application/json",
                    },

                    body:
                      JSON.stringify({
                        text:
                          "SOS emergency help",

                        latitude:
                          position.coords
                            .latitude,

                        longitude:
                          position.coords
                            .longitude,

                        requesterName:
                          currentUser.name,
                      }),
                  }
                );

              const data =
                await result.json();

              setSosMessage(
                data.response
              );
            } catch (error) {
              console.error(
                error
              );

              setSosMessage(
                "Beacon250 could not activate the emergency network."
              );
            } finally {
              setSosLoading(
                false
              );
            }
          },

          () => {
            setSosMessage(
              "Unable to access your location."
            );

            setSosLoading(
              false
            );
          },

          {
            enableHighAccuracy:
              true,

            timeout: 20000,

            maximumAge: 0,
          }
        );
    };

  // ==================================================
  // END EMERGENCY
  // ==================================================

  const endEmergency = () => {
    socket.emit(
      "incident-resolved"
    );

    setEmergencyActive(
      false
    );

    setEmergencyLocation(
      null
    );

    setSecurityResponding(
      false
    );

    setResponderResponses([]);

    setHasAcknowledgedResponse(false);

    setSosMessage("");

    setSirenMuted(false);
  };

  // ==================================================
  // DEMO SIGN-IN SCREEN
  // ==================================================

  if (!selectedProfile) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "28px 18px",
          background:
            "radial-gradient(circle at top right, rgba(14,165,233,0.14), transparent 35%), linear-gradient(145deg, #07111f 0%, #0f2742 52%, #102a43 100%)",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "760px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
              color: "white",
            }}
          >
            <div className="beacon-symbol">
              <div className="beacon-symbol-core" />
            </div>

            <div>
              <div
                style={{
                  fontSize: "22px",
                  fontWeight: 950,
                  letterSpacing: "-0.6px",
                }}
              >
                Beacon250
              </div>
              <div
                style={{
                  marginTop: "2px",
                  color: "#bae6fd",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.9px",
                  textTransform: "uppercase",
                }}
              >
                Community Safety Network
              </div>
            </div>
          </div>

          <div
            style={{
              overflow: "hidden",
              borderRadius: "26px",
              background: "rgba(255,255,255,0.98)",
              border: "1px solid rgba(255,255,255,0.35)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.28)",
            }}
          >
            <div
              style={{
                padding: "28px 28px 22px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "7px 10px",
                  borderRadius: "999px",
                  background: "#ecfdf5",
                  border: "1px solid #bbf7d0",
                  color: "#047857",
                  fontSize: "9px",
                  fontWeight: 900,
                  letterSpacing: "0.7px",
                }}
              >
                ● HACKATHON DEMO MODE
              </div>

              <h1
                style={{
                  margin: "14px 0 7px",
                  fontSize: "clamp(28px, 5vw, 38px)",
                  lineHeight: 1.08,
                  letterSpacing: "-1px",
                  color: "#0f172a",
                }}
              >
                Choose a verified demo profile
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: "590px",
                  color: "#64748b",
                  fontSize: "13px",
                  lineHeight: 1.6,
                }}
              >
                Select a resident or security identity to demonstrate the Beacon250 emergency network. Production deployment would use authenticated accounts and residence or role verification.
              </p>
            </div>

            <div
              style={{
                padding: "20px 22px 24px",
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))",
                gap: "12px",
              }}
            >
              {demoProfiles.map((demoProfile) => {
                const isSecurity =
                  demoProfile.type === "Verified Security";

                return (
                  <button
                    key={demoProfile.name}
                    onClick={() =>
                      signInDemo(demoProfile)
                    }
                    style={{
                      textAlign: "left",
                      padding: "18px",
                      borderRadius: "18px",
                      border: isSecurity
                        ? "1px solid #a7f3d0"
                        : "1px solid #bfdbfe",
                      background: isSecurity
                        ? "linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)"
                        : "linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)",
                      color: "#0f172a",
                      cursor: "pointer",
                      boxShadow:
                        "0 8px 22px rgba(15,23,42,0.05)",
                    }}
                  >
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "14px",
                        background: isSecurity
                          ? "#dcfce7"
                          : "#dbeafe",
                        fontSize: "23px",
                      }}
                    >
                      {demoProfile.icon}
                    </div>

                    <div
                      style={{
                        marginTop: "13px",
                        fontSize: "16px",
                        fontWeight: 900,
                      }}
                    >
                      {demoProfile.name}
                    </div>

                    <div
                      style={{
                        marginTop: "4px",
                        color: isSecurity
                          ? "#047857"
                          : "#1d4ed8",
                        fontSize: "10px",
                        fontWeight: 900,
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                      }}
                    >
                      ✓ {demoProfile.type}
                    </div>

                    <div
                      style={{
                        marginTop: "9px",
                        color: "#64748b",
                        fontSize: "11px",
                        lineHeight: 1.45,
                      }}
                    >
                      {demoProfile.description}
                    </div>

                    <div
                      style={{
                        marginTop: "14px",
                        color: "#0f172a",
                        fontSize: "11px",
                        fontWeight: 900,
                      }}
                    >
                      Continue as {demoProfile.name} →
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                margin: "0 22px 22px",
                padding: "13px 14px",
                borderRadius: "13px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "flex",
                gap: "10px",
                color: "#64748b",
                fontSize: "10px",
                lineHeight: 1.5,
              }}
            >
              <span style={{ fontSize: "15px" }}>🔒</span>
              <span>
                Demo identities simulate verified onboarding for the hackathon. No password or personal information is collected on this screen.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================================================
  // UNIFIED RESPONDER ALERT SCREEN
  // ==================================================

  if (
    !emergencyActive &&
    nearbyAlert &&
    nearbyVictimLocation
  ) {
    return (
      <div className="beacon-responder-page">

        <div className="beacon-responder-shell">

          {/* ============================= */}
          {/* TOP BAR */}
          {/* ============================= */}

          <div className="beacon-topbar">

            <div className="beacon-brand">

              <div className="beacon-symbol">
                <div className="beacon-symbol-core" />
              </div>

              <div>

                <h2 className="beacon-brand-title">
                  Beacon250
                </h2>

                <div className="beacon-brand-subtitle">
                  Community Safety Network
                </div>

              </div>

            </div>

            <div className="beacon-verified">

              {currentUser.type ===
              "Verified Security"
                ? "VERIFIED SECURITY"
                : "VERIFIED RESPONDER"}

            </div>

          </div>

          {/* ============================= */}
          {/* ACTIVE ALERT */}
          {/* ============================= */}

          <div className="beacon-alert-card">

            <div className="beacon-alert-header">

              <div className="beacon-alert-icon">
                🚨
              </div>

              <div>

                <div className="beacon-alert-eyebrow">
                  ACTIVE INCIDENT
                </div>

                <h1 className="beacon-alert-title">
                  Safety Alert
                </h1>

                <p className="beacon-alert-copy">
                  A verified nearby
                  community member has
                  requested emergency
                  assistance.
                </p>

              </div>

            </div>

            <div className="beacon-alert-meta">

              <div className="beacon-meta-pill">
                📍 Approximately{" "}
                {nearbyAlert.distance} m
                away
              </div>

              <div className="beacon-meta-pill">

                <span className="beacon-live-dot" />

                LIVE LOCATION

              </div>

            </div>

          </div>

          {/* ============================= */}
          {/* LIVE MAP */}
          {/* ============================= */}

          <div className="beacon-section-card">

            <div className="beacon-section-label">

              <div className="beacon-section-title">
                LIVE INCIDENT MAP
              </div>

              <div className="beacon-section-status">
                ● TRACKING
              </div>

            </div>

            <div className="beacon-map-wrap">

              <SafetyMap
                latitude={
                  nearbyVictimLocation
                    .latitude
                }

                longitude={
                  nearbyVictimLocation
                    .longitude
                }

                responderLocation={
                  nearbyResponderLocation
                }
              />

            </div>

          </div>

          {/* ============================= */}
          {/* RESPONSE ACTIONS */}
          {/* ============================= */}

          <div className="beacon-section-card">

            <div className="beacon-section-label">

              <div className="beacon-section-title">
                RESPONSE ACTIONS
              </div>

              <div className="beacon-section-status">
                STAY SAFE
              </div>

            </div>

            <div className="beacon-actions">

              {/* RESPONSE CONFIRMATION */}

              <button
                className="beacon-action"
                disabled={
                  hasAcknowledgedResponse
                }
                style={{
                  gridColumn:
                    "1 / -1",

                  minHeight:
                    "62px",

                  background:
                    hasAcknowledgedResponse
                      ? "#d1fae5"
                      : "linear-gradient(135deg, #087a4b, #16a36a)",

                  color:
                    hasAcknowledgedResponse
                      ? "#065f46"
                      : "white",

                  fontSize:
                    "14px",

                  boxShadow:
                    hasAcknowledgedResponse
                      ? "none"
                      : "0 8px 20px rgba(22,163,106,0.20)",

                  cursor:
                    hasAcknowledgedResponse
                      ? "default"
                      : "pointer",
                }}

                onClick={() => {
                  if (
                    hasAcknowledgedResponse
                  ) {
                    return;
                  }

                  if (
                    currentUser.type ===
                    "Verified Security"
                  ) {
                    socket.emit(
                      "security-responding",
                      {
                        name:
                          currentUser.name,
                      }
                    );
                  } else {
                    socket.emit(
                      "responder-responding",
                      {
                        name:
                          currentUser.name,
                        type:
                          currentUser.type,
                      }
                    );
                  }

                  setHasAcknowledgedResponse(
                    true
                  );
                }}
              >
                {hasAcknowledgedResponse
                  ? "✓ RESPONSE CONFIRMED"
                  : currentUser.type ===
                    "Verified Security"
                    ? "🛡️ I'M RESPONDING"
                    : "🤝 I'M RESPONDING"}
              </button>

              {/* LIGHTS */}

              <button
                className="
                  beacon-action
                  beacon-action-lights
                "
              >
                💡 Turn Lights On
              </button>

              {/* CALL */}

              <button
                className="
                  beacon-action
                  beacon-action-call
                "

                onClick={() => {
                  window.location.href =
                    "tel:112";
                }}
              >
                📞 Call 112
              </button>

              {/* MUTE */}

              <button
                className="
                  beacon-action
                  beacon-action-mute
                "

                onClick={() => {
                  setSirenMuted(
                    true
                  );
                }}
              >
                🔇 Mute Alarm
              </button>

              {/* OBSERVE */}

              <button
                className="
                  beacon-action
                  beacon-action-observe
                "
              >
                👀 Observe Safely
              </button>

            </div>

            <div className="beacon-privacy">

              <div className="beacon-privacy-lock">
                🔒
              </div>

              <div>
                Live victim location is
                available only during the
                active emergency.
                Location access ends when
                the incident is resolved.
              </div>

            </div>

          </div>

        </div>

      </div>
    );
  }

  // ==================================================
  // ACTIVE VICTIM SCREEN
  // ==================================================

  if (
    emergencyActive &&
    emergencyLocation
  ) {
    const totalConfirmedResponders =
      responderResponses.length +
      (securityResponding ? 1 : 0);

    return (
      <div className="beacon-responder-page">
        <div className="beacon-responder-shell">

          {/* TOP BAR */}

          <div className="beacon-topbar">
            <div className="beacon-brand">
              <div className="beacon-symbol">
                <div className="beacon-symbol-core" />
              </div>

              <div>
                <h2 className="beacon-brand-title">
                  Beacon250
                </h2>

                <div className="beacon-brand-subtitle">
                  Community Safety Network
                </div>
              </div>
            </div>

            <div
              className="beacon-verified"
              style={{
                background: "#fee2e2",
                color: "#b91c1c",
              }}
            >
              ACTIVE SOS
            </div>
          </div>

          {/* EMERGENCY HERO */}

          <div className="beacon-alert-card">
            <div className="beacon-alert-header">
              <div className="beacon-alert-icon">
                🚨
              </div>

              <div>
                <div className="beacon-alert-eyebrow">
                  EMERGENCY NETWORK ACTIVE
                </div>

                <h1 className="beacon-alert-title">
                  SOS Active
                </h1>

                <p className="beacon-alert-copy">
                  Your emergency alert has been sent to verified nearby responders. Your live location is being shared only while this incident is active.
                </p>
              </div>
            </div>

            <div className="beacon-alert-meta">
              <div className="beacon-meta-pill">
                📍 GPS ±{Math.round(
                  emergencyLocation.accuracy || 0
                )} m
              </div>

              <div className="beacon-meta-pill">
                <span className="beacon-live-dot" />
                LIVE LOCATION SHARING
              </div>
            </div>
          </div>

          {/* LIVE MAP */}

          <div className="beacon-section-card">
            <div className="beacon-section-label">
              <div className="beacon-section-title">
                YOUR LIVE SAFETY MAP
              </div>

              <div className="beacon-section-status">
                ● SHARING
              </div>
            </div>

            <div className="beacon-map-wrap">
              <SafetyMap
                latitude={
                  emergencyLocation.latitude
                }
                longitude={
                  emergencyLocation.longitude
                }
              />
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 14px",
                borderRadius: "12px",
                background: "#f8fafc",
                color: "#475569",
                fontSize: "13px",
                lineHeight: 1.45,
              }}
            >
              <span style={{ fontSize: "18px" }}>🔒</span>
              <span>
                Exact live location is available only to verified responders during this emergency and is cleared when you mark yourself safe.
              </span>
            </div>
          </div>

          {/* HELP STATUS */}

          <div className="beacon-section-card">
            <div className="beacon-section-label">
              <div className="beacon-section-title">
                HELP STATUS
              </div>

              <div className="beacon-section-status">
                {totalConfirmedResponders > 0
                  ? `${totalConfirmedResponders} CONFIRMED`
                  : "WAITING"}
              </div>
            </div>

            {totalConfirmedResponders === 0 && (
              <div
                style={{
                  padding: "18px",
                  borderRadius: "14px",
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  color: "#9a3412",
                  textAlign: "center",
                  fontWeight: 700,
                }}
              >
                ⏳ Nearby verified responders have been alerted. Waiting for acknowledgement...
              </div>
            )}

            {securityResponding && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "16px",
                  borderRadius: "14px",
                  background: "#ecfdf5",
                  border: "1px solid #86efac",
                  marginBottom:
                    responderResponses.length > 0
                      ? "12px"
                      : 0,
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "#16a34a",
                    color: "white",
                    fontSize: "21px",
                    flexShrink: 0,
                  }}
                >
                  🛡️
                </div>

                <div>
                  <strong
                    style={{
                      display: "block",
                      color: "#166534",
                      fontSize: "15px",
                    }}
                  >
                    Security is responding
                  </strong>

                  <span
                    style={{
                      color: "#15803d",
                      fontSize: "13px",
                    }}
                  >
                    A verified security responder has acknowledged your SOS.
                  </span>
                </div>
              </div>
            )}

            {responderResponses.length > 0 && (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "14px",
                  background: "#eff6ff",
                  border: "1px solid #93c5fd",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "10px",
                    color: "#1e3a8a",
                    fontWeight: 800,
                    fontSize: "14px",
                  }}
                >
                  <span>🤝</span>
                  COMMUNITY RESPONDING
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {responderResponses.map(
                    (responder) => (
                      <div
                        key={responder.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "9px",
                          padding: "11px 12px",
                          borderRadius: "10px",
                          background: "white",
                          color: "#1e40af",
                          fontWeight: 700,
                          fontSize: "13px",
                        }}
                      >
                        <span>✓</span>
                        <span>
                          {responder.name} is responding
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SAFE ACTION */}

          <div className="beacon-section-card">
            <button
              onClick={endEmergency}
              style={{
                width: "100%",
                minHeight: "64px",
                border: "none",
                borderRadius: "14px",
                background:
                  "linear-gradient(135deg, #15803d, #22c55e)",
                color: "white",
                fontSize: "16px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow:
                  "0 10px 24px rgba(34,197,94,0.22)",
              }}
            >
              ✓ I'M SAFE — END SOS
            </button>

            <p
              style={{
                margin: "10px 0 0",
                textAlign: "center",
                color: "#64748b",
                fontSize: "12px",
                lineHeight: 1.45,
              }}
            >
              Use this only when you are safe. It ends responder alerts and stops live-location sharing.
            </p>
          </div>

          {/* SYSTEM MESSAGE */}

          {sosMessage && (
            <div
              style={{
                marginTop: "14px",
                padding: "13px 15px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.85)",
                border: "1px solid #e2e8f0",
                color: "#475569",
                textAlign: "center",
                fontSize: "12px",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "#0f172a" }}>
                Beacon250:
              </strong>{" "}
              {sosMessage}
            </div>
          )}

        </div>
      </div>
    );
  }

  // ==================================================
  // NORMAL HOME SCREEN
  // ==================================================

  const navItems = [
    { key: "home", icon: "⌂", label: "Home" },
    { key: "map", icon: "⌖", label: "Map" },
    { key: "alerts", icon: "◉", label: "Alerts" },
    { key: "community", icon: "♙", label: "Community" },
    { key: "profile", icon: "●", label: "Profile" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(14,165,233,0.10), transparent 32%), linear-gradient(180deg, #f8fbff 0%, #eef4f8 100%)",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#0f172a",
      }}
    >
      {/* HEADER */}

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 90,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            padding: "15px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "11px",
            }}
          >
            <div className="beacon-symbol">
              <div className="beacon-symbol-core" />
            </div>

            <div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 900,
                  letterSpacing: "-0.4px",
                  lineHeight: 1.05,
                }}
              >
                Beacon250
              </div>

              <div
                style={{
                  marginTop: "3px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#64748b",
                  letterSpacing: "0.7px",
                  textTransform: "uppercase",
                }}
              >
                Community Safety Network
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "7px 10px",
              borderRadius: "999px",
              background:
                currentUser.type === "Verified Security"
                  ? "#ecfdf5"
                  : "#eff6ff",
              border:
                currentUser.type === "Verified Security"
                  ? "1px solid #a7f3d0"
                  : "1px solid #bfdbfe",
              color:
                currentUser.type === "Verified Security"
                  ? "#047857"
                  : "#1d4ed8",
              fontSize: "9px",
              fontWeight: 900,
              letterSpacing: "0.6px",
              whiteSpace: "nowrap",
            }}
          >
            ✓ {currentUser.type === "Verified Security"
              ? "VERIFIED SECURITY"
              : "VERIFIED HOUSEHOLD"}
          </div>
        </div>
      </header>

      {/* MAIN */}

      <main
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "22px 20px 120px",
        }}
      >
        {/* ====================== */}
        {/* HOME */}
        {/* ====================== */}

        {activeTab === "home" && (
          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {/* NETWORK STATUS */}

            <section
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: "22px",
                padding: "22px",
                background:
                  "linear-gradient(135deg, #0b1220 0%, #16243a 100%)",
                color: "white",
                boxShadow:
                  "0 18px 45px rgba(15,23,42,0.14)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: "170px",
                  height: "170px",
                  borderRadius: "50%",
                  border: "1px solid rgba(56,189,248,0.20)",
                  right: "-55px",
                  top: "-70px",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  width: "115px",
                  height: "115px",
                  borderRadius: "50%",
                  border: "1px solid rgba(56,189,248,0.16)",
                  right: "-25px",
                  top: "-42px",
                }}
              />

              <div
                style={{
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 10px",
                      borderRadius: "999px",
                      background: "rgba(34,197,94,0.12)",
                      border: "1px solid rgba(74,222,128,0.28)",
                      color: "#bbf7d0",
                      fontSize: "10px",
                      fontWeight: 900,
                      letterSpacing: "0.7px",
                    }}
                  >
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: "#22c55e",
                        boxShadow: "0 0 0 5px rgba(34,197,94,0.12)",
                      }}
                    />
                    SAFETY NETWORK ACTIVE
                  </div>

                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      fontWeight: 700,
                    }}
                  >
                    Signed in as {currentUser.name}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "20px",
                    fontSize: "10px",
                    fontWeight: 900,
                    letterSpacing: "1.2px",
                    color: "#7dd3fc",
                    textTransform: "uppercase",
                  }}
                >
                  Hyper-local emergency response
                </div>

                <h1
                  style={{
                    margin: "7px 0 9px",
                    maxWidth: "560px",
                    fontSize: "clamp(27px, 5vw, 38px)",
                    lineHeight: 1.05,
                    letterSpacing: "-1.1px",
                    color: "#ffffff",
                    fontWeight: 900,
                  }}
                >
                  Help is already nearby.
                </h1>

                <p
                  style={{
                    margin: 0,
                    maxWidth: "575px",
                    color: "#dbeafe",
                    fontSize: "14px",
                    lineHeight: 1.65,
                    fontWeight: 500,
                  }}
                >
                  One SOS connects you to verified nearby households and security within the 250 metre Beacon250 response zone.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "10px",
                    marginTop: "18px",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 13px",
                      borderRadius: "13px",
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        fontWeight: 800,
                        letterSpacing: "0.7px",
                      }}
                    >
                      LOCAL RESPONSE ZONE
                    </div>
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "17px",
                        fontWeight: 900,
                      }}
                    >
                      250 m
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px 13px",
                      borderRadius: "13px",
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        fontWeight: 800,
                        letterSpacing: "0.7px",
                      }}
                    >
                      LIVE LOCATION
                    </div>
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "17px",
                        fontWeight: 900,
                      }}
                    >
                      SOS only
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SOS ACTION */}

            <section
              style={{
                borderRadius: "22px",
                background: "white",
                border: "1px solid #e2e8f0",
                padding: "24px 20px",
                boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 900,
                  color: "#dc2626",
                  letterSpacing: "0.9px",
                  textTransform: "uppercase",
                }}
              >
                Emergency Assistance
              </div>

              <h2
                style={{
                  margin: "7px 0 5px",
                  fontSize: "24px",
                  letterSpacing: "-0.5px",
                }}
              >
                Need help now?
              </h2>

              <p
                style={{
                  margin: "0 auto 22px",
                  maxWidth: "430px",
                  color: "#64748b",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                Trigger an SOS to share your live location with eligible verified responders nearby.
              </p>

              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <div
                  style={{
                    width: "172px",
                    height: "172px",
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(230,57,70,0.08)",
                    boxShadow: "0 0 0 12px rgba(230,57,70,0.04)",
                  }}
                >
                  <button
                    onClick={triggerHomeSOS}
                    disabled={sosLoading}
                    aria-label="Trigger emergency SOS"
                    style={{
                      width: "142px",
                      height: "142px",
                      borderRadius: "50%",
                      border: "6px solid rgba(255,255,255,0.9)",
                      background:
                        "linear-gradient(145deg, #f04452, #c81d2b)",
                      color: "white",
                      cursor: sosLoading ? "wait" : "pointer",
                      boxShadow:
                        "0 16px 30px rgba(200,29,43,0.30), inset 0 1px 0 rgba(255,255,255,0.25)",
                      opacity: sosLoading ? 0.72 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: "30px",
                        fontWeight: 950,
                        letterSpacing: "1px",
                      }}
                    >
                      {sosLoading ? "..." : "SOS"}
                    </div>
                    <div
                      style={{
                        marginTop: "3px",
                        fontSize: "9px",
                        fontWeight: 800,
                        letterSpacing: "0.8px",
                        opacity: 0.88,
                      }}
                    >
                      {sosLoading ? "ACTIVATING" : "PRESS FOR HELP"}
                    </div>
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: "18px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  color: "#64748b",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                <span>🔒</span>
                Live location is shared only during an active SOS
              </div>

              {sosMessage && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    color: "#9a3412",
                    fontSize: "12px",
                    fontWeight: 700,
                    lineHeight: 1.45,
                  }}
                >
                  {sosMessage}
                </div>
              )}
            </section>

            {/* ALEXA */}

            <section
              style={{
                borderRadius: "20px",
                padding: "18px",
                background:
                  "linear-gradient(135deg, #0f2742 0%, #153a5f 100%)",
                color: "white",
                boxShadow: "0 10px 26px rgba(15,39,66,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "15px",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(56,189,248,0.13)",
                    border: "1px solid rgba(125,211,252,0.22)",
                    fontSize: "22px",
                    flexShrink: 0,
                  }}
                >
                  ✦
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#7dd3fc",
                      fontWeight: 900,
                      letterSpacing: "0.7px",
                    }}
                  >
                    ALEXA+ VOICE SOS
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "16px",
                      fontWeight: 850,
                    }}
                  >
                    Hands-free emergency activation
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      color: "#cbd5e1",
                      fontSize: "12px",
                      lineHeight: 1.45,
                    }}
                  >
                    Say “Alexa, I need help” in the simulated Alexa+ experience.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowAlexa(true)}
                style={{
                  width: "100%",
                  marginTop: "14px",
                  padding: "13px 15px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "white",
                  color: "#0f2742",
                  fontSize: "13px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                🎙 Open Alexa+ Emergency Assistant
              </button>
            </section>

            {/* ALERT SOUND */}

            <section
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                padding: "16px 17px",
                borderRadius: "17px",
                background: "white",
                border: "1px solid #e2e8f0",
                boxShadow: "0 7px 22px rgba(15,23,42,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "12px",
                    background: soundEnabled ? "#ecfdf5" : "#f1f5f9",
                    color: soundEnabled ? "#15803d" : "#475569",
                    fontSize: "18px",
                  }}
                >
                  🔊
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 850,
                    }}
                  >
                    Nearby emergency alerts
                  </div>
                  <div
                    style={{
                      marginTop: "2px",
                      fontSize: "11px",
                      color: "#64748b",
                    }}
                  >
                    {soundEnabled
                      ? "Sound is enabled for responder alerts"
                      : "Enable sound so nearby SOS alerts can get your attention"}
                  </div>
                </div>
              </div>

              {!soundEnabled ? (
                <button
                  onClick={enableEmergencySound}
                  style={{
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    background: "#0f172a",
                    color: "white",
                    fontSize: "10px",
                    fontWeight: 900,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  ENABLE
                </button>
              ) : (
                <div
                  style={{
                    padding: "8px 10px",
                    borderRadius: "999px",
                    background: "#ecfdf5",
                    color: "#15803d",
                    border: "1px solid #bbf7d0",
                    fontSize: "9px",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  ● ON
                </div>
              )}
            </section>

            {/* TRUST / PRIVACY */}

            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(145px, 1fr))",
                gap: "10px",
              }}
            >
              {[
                {
                  icon: "✓",
                  title: "Verified network",
                  text: "Only registered demo responders receive the active alert.",
                },
                {
                  icon: "⌖",
                  title: "Live safety map",
                  text: "Responder routing is shown with Amazon Location Services.",
                },
                {
                  icon: "🔒",
                  title: "Privacy by incident",
                  text: "Exact location sharing ends when the SOS is resolved.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    padding: "15px",
                    borderRadius: "15px",
                    background: "rgba(255,255,255,0.75)",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      width: "31px",
                      height: "31px",
                      borderRadius: "10px",
                      display: "grid",
                      placeItems: "center",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontSize: "14px",
                      fontWeight: 900,
                    }}
                  >
                    {item.icon}
                  </div>
                  <div
                    style={{
                      marginTop: "9px",
                      fontSize: "12px",
                      fontWeight: 850,
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      color: "#64748b",
                      fontSize: "10px",
                      lineHeight: 1.45,
                    }}
                  >
                    {item.text}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {/* ====================== */}
        {/* MAP */}
        {/* ====================== */}

        {activeTab === "map" && (
          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            <section
              style={{
                borderRadius: "22px",
                padding: "22px",
                background:
                  "linear-gradient(135deg, #0b1220 0%, #18314f 100%)",
                color: "white",
                boxShadow:
                  "0 18px 42px rgba(15,23,42,0.13)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "14px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      color: "#7dd3fc",
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                    }}
                  >
                    Live safety coverage
                  </div>

                  <h2
                    style={{
                      margin: "6px 0 7px",
                      color: "#ffffff",
                      fontSize: "25px",
                      letterSpacing: "-0.6px",
                    }}
                  >
                    Your 250 m response zone
                  </h2>

                  <p
                    style={{
                      margin: 0,
                      maxWidth: "520px",
                      color: "#cbd5e1",
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    This map shows your current location and the local Beacon250 response radius. During an SOS, eligible responders receive the live incident location and route guidance.
                  </p>
                </div>

                <div
                  style={{
                    padding: "8px 11px",
                    borderRadius: "999px",
                    background: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(74,222,128,0.30)",
                    color: "#bbf7d0",
                    fontSize: "9px",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  ● NETWORK READY
                </div>
              </div>
            </section>

            <section
              style={{
                overflow: "hidden",
                borderRadius: "22px",
                background: "white",
                border: "1px solid #e2e8f0",
                boxShadow:
                  "0 12px 34px rgba(15,23,42,0.06)",
              }}
            >
              <div
                style={{
                  padding: "16px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 900,
                      color: "#0284c7",
                      letterSpacing: "0.8px",
                    }}
                  >
                    CURRENT SAFETY MAP
                  </div>
                  <div
                    style={{
                      marginTop: "3px",
                      color: "#64748b",
                      fontSize: "11px",
                    }}
                  >
                    {homeMapStatus}
                  </div>
                </div>

                <button
                  onClick={loadHomeMapLocation}
                  disabled={homeMapLoading}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    padding: "9px 11px",
                    background: "#f8fafc",
                    color: "#0f172a",
                    fontSize: "10px",
                    fontWeight: 900,
                    cursor: homeMapLoading ? "wait" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {homeMapLoading
                    ? "LOCATING..."
                    : "↻ REFRESH LOCATION"}
                </button>
              </div>

              <div
                style={{
                  padding: "12px",
                }}
              >
                {homeMapLocation ? (
                  <>
                    <div
                      style={{
                        overflow: "hidden",
                        borderRadius: "16px",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <SafetyMap
                        latitude={
                          homeMapLocation.latitude
                        }
                        longitude={
                          homeMapLocation.longitude
                        }
                      />
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(145px, 1fr))",
                        gap: "9px",
                        marginTop: "11px",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 13px",
                          borderRadius: "13px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "9px",
                            fontWeight: 900,
                            color: "#64748b",
                            letterSpacing: "0.7px",
                          }}
                        >
                          RESPONSE RADIUS
                        </div>
                        <div
                          style={{
                            marginTop: "3px",
                            fontSize: "16px",
                            fontWeight: 900,
                            color: "#0f172a",
                          }}
                        >
                          250 metres
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "12px 13px",
                          borderRadius: "13px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "9px",
                            fontWeight: 900,
                            color: "#64748b",
                            letterSpacing: "0.7px",
                          }}
                        >
                          GPS ACCURACY
                        </div>
                        <div
                          style={{
                            marginTop: "3px",
                            fontSize: "16px",
                            fontWeight: 900,
                            color: "#0f172a",
                          }}
                        >
                          ±{Math.round(
                            homeMapLocation.accuracy
                          )} m
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      minHeight: "310px",
                      display: "grid",
                      placeItems: "center",
                      textAlign: "center",
                      padding: "28px",
                      borderRadius: "16px",
                      background:
                        "linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%)",
                      border: "1px dashed #cbd5e1",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          width: "54px",
                          height: "54px",
                          margin: "0 auto",
                          display: "grid",
                          placeItems: "center",
                          borderRadius: "16px",
                          background: "#e0f2fe",
                          color: "#0369a1",
                          fontSize: "25px",
                        }}
                      >
                        ⌖
                      </div>
                      <div
                        style={{
                          marginTop: "12px",
                          fontSize: "15px",
                          fontWeight: 900,
                          color: "#0f172a",
                        }}
                      >
                        {homeMapLoading
                          ? "Loading your safety map..."
                          : "Location is required for the safety map"}
                      </div>
                      <div
                        style={{
                          marginTop: "5px",
                          color: "#64748b",
                          fontSize: "11px",
                          lineHeight: 1.5,
                          maxWidth: "360px",
                        }}
                      >
                        {homeMapStatus}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(145px, 1fr))",
                gap: "10px",
              }}
            >
              {[
                {
                  title: "250 m eligibility",
                  text: "Only responders inside the emergency radius are alerted.",
                },
                {
                  title: "Live during SOS",
                  text: "Victim movement updates the active responder map.",
                },
                {
                  title: "Route guidance",
                  text: "Amazon Location routing guides responders toward the incident.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    padding: "15px",
                    borderRadius: "15px",
                    background: "white",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 900,
                      color: "#0f172a",
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      color: "#64748b",
                      fontSize: "10px",
                      lineHeight: 1.45,
                    }}
                  >
                    {item.text}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}

        {/* ====================== */}
        {/* ALERTS */}
        {/* ====================== */}

        {activeTab === "alerts" && (
          <div
            style={{
              padding: "22px",
              borderRadius: "20px",
              background: "white",
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 900,
                color: "#dc2626",
                letterSpacing: "0.7px",
              }}
            >
              NEARBY ALERTS
            </div>
            <h2 style={{ margin: "7px 0 12px" }}>
              Community incidents
            </h2>

            {!nearbyAlert ? (
              <div
                style={{
                  padding: "18px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  color: "#64748b",
                  fontSize: "13px",
                }}
              >
                ✓ No active nearby emergency alerts.
              </div>
            ) : (
              <div
                style={{
                  padding: "18px",
                  borderRadius: "14px",
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  color: "#9f1239",
                }}
              >
                <strong>🚨 Active Safety Alert</strong>
                <div style={{ marginTop: "6px", fontSize: "13px" }}>
                  Approximately {nearbyAlert.distance} metres away.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================== */}
        {/* COMMUNITY */}
        {/* ====================== */}

        {activeTab === "community" && (
          <div
            style={{
              padding: "22px",
              borderRadius: "20px",
              background: "white",
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 900,
                color: "#16a34a",
                letterSpacing: "0.7px",
              }}
            >
              MY COMMUNITY
            </div>
            <h2 style={{ margin: "7px 0 8px" }}>
              Verified responder network
            </h2>
            <p
              style={{
                color: "#64748b",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              Signed in as <strong>{currentUser.name}</strong> · {currentUser.type}
            </p>
            <div
              style={{
                marginTop: "15px",
                padding: "14px",
                borderRadius: "13px",
                background: "#ecfdf5",
                border: "1px solid #bbf7d0",
                color: "#166534",
                fontSize: "12px",
                fontWeight: 750,
              }}
            >
              ● Connected to the Beacon250 community safety network
            </div>
          </div>
        )}

        {/* ====================== */}
        {/* PROFILE */}
        {/* ====================== */}

        {activeTab === "profile" && (
          <div
            style={{
              padding: "22px",
              borderRadius: "20px",
              background: "white",
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05)",
            }}
          >
            <div
              style={{
                width: "54px",
                height: "54px",
                borderRadius: "16px",
                display: "grid",
                placeItems: "center",
                background: "#eff6ff",
                color: "#1d4ed8",
                fontSize: "20px",
                fontWeight: 900,
              }}
            >
              {currentUser.name.charAt(0)}
            </div>

            <h2 style={{ margin: "13px 0 3px" }}>
              {currentUser.name}
            </h2>
            <div
              style={{
                color: "#64748b",
                fontSize: "12px",
              }}
            >
              {currentUser.type}
            </div>

            <div
              style={{
                marginTop: "17px",
                padding: "13px 14px",
                borderRadius: "13px",
                background: "#ecfdf5",
                border: "1px solid #bbf7d0",
                color: "#166534",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              ● Beacon250 safety network active
            </div>

            <div
              style={{
                marginTop: "12px",
                padding: "12px 14px",
                borderRadius: "13px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                color: "#64748b",
                fontSize: "10px",
                lineHeight: 1.5,
              }}
            >
              Hackathon demo identity. Production deployment would use authenticated accounts and residence or role verification.
            </div>

            <button
              onClick={signOutDemo}
              style={{
                width: "100%",
                marginTop: "14px",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                background: "white",
                color: "#0f172a",
                fontSize: "11px",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Sign Out / Switch Demo Profile
            </button>
          </div>
        )}
      </main>

      {/* ================================================== */}
      {/* BOTTOM NAVIGATION */}
      {/* ================================================== */}

      <nav
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "14px",
          width: "calc(100% - 28px)",
          maxWidth: "680px",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "4px",
          padding: "7px",
          borderRadius: "18px",
          background: "rgba(255,255,255,0.96)",
          border: "1px solid #e2e8f0",
          boxShadow: "0 16px 38px rgba(15,23,42,0.14)",
          backdropFilter: "blur(12px)",
          zIndex: 100,
        }}
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.key;

          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              style={{
                border: "none",
                borderRadius: "12px",
                padding: "9px 3px 8px",
                background: isActive ? "#0f172a" : "transparent",
                color: isActive ? "white" : "#64748b",
                cursor: "pointer",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  lineHeight: 1,
                  fontWeight: 900,
                }}
              >
                {item.icon}
              </div>
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "8px",
                  fontWeight: 850,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </div>
            </button>
          );
        })}
      </nav>

      {/* ================================================== */}
      {/* ALEXA OVERLAY */}
      {/* ================================================== */}

      {showAlexa && (
        <div
          style={{
            position:
              "fixed",

            inset:
              0,

            zIndex:
              1000,

            background:
              "#07111f",
          }}
        >

          <button
            onClick={() =>
              setShowAlexa(
                false
              )
            }

            style={{
              position:
                "absolute",

              top:
                "20px",

              right:
                "20px",

              zIndex:
                1001,

              border:
                "none",

              borderRadius:
                "10px",

              padding:
                "10px 16px",

              cursor:
                "pointer",

              fontWeight:
                "bold",
            }}
          >
            ✕ Close
          </button>

<AlexaSimulator
  requesterName={currentUser.name}
  onEmergencyActivated={(
    location,
    response
  ) => {
    setNearbyAlert(null);

    setNearbyVictimLocation(null);

    setNearbyResponderLocation(null);

    setEmergencyLocation(location);

    setEmergencyActive(true);

    setSecurityResponding(false);

    setResponderResponses([]);

    setHasAcknowledgedResponse(false);

    setSosMessage(
      response ||
        "Beacon250 emergency network activated."
    );

    setShowAlexa(false);
  }}
/>
        </div>
      )}

    </div>
  );
}

export default BeaconHome;