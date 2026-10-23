const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let activeResponderNames = [];

// --------------------------------
// TEST ROUTE
// --------------------------------

app.get("/", (req, res) => {
  res.send("Beacon250 backend is running");
});

// --------------------------------
// SOCKET.IO CONNECTION
// --------------------------------

io.on("connection", (socket) => {
  console.log("Device connected:", socket.id);

  // --------------------------------
  // REGISTER HOUSE / SECURITY GUARD
  // --------------------------------

  socket.on("register-responder", (data) => {
    const responderName = data.name;

    if (!responderName) {
      console.log(
        "Responder registration failed: no name"
      );
      return;
    }

    socket.join(responderName);

    console.log(
      `Responder registered: ${responderName}`
    );
  });

  // --------------------------------
  // VICTIM TRIGGERS SOS
  // --------------------------------

  socket.on("trigger-sos", (data) => {
    console.log("SOS RECEIVED");

    const nearbyResponders =
      data.nearbyResponders || [];

    activeResponderNames =
      nearbyResponders.map(
        (responder) => responder.name
      );

    nearbyResponders.forEach(
      (responder) => {
        console.log(
          `Alerting ${responder.name} at ${responder.distance}m`
        );

        io.to(responder.name).emit(
          "emergency-alert",
          {
            message:
              "Safety emergency detected nearby",

            distance:
              responder.distance,

            responderName:
              responder.name,

            victimLocation:
              data.location,

            responderLocation: {
              latitude:
                responder.latitude,

              longitude:
                responder.longitude,
            },

            timestamp:
              new Date().toISOString(),
          }
        );
      }
    );
  });

  // --------------------------------
  // LIVE VICTIM LOCATION
  // --------------------------------

  socket.on(
    "victim-location-update",
    (location) => {
      console.log(
        "LIVE VICTIM LOCATION UPDATE"
      );

      activeResponderNames.forEach(
        (responderName) => {
          io.to(responderName).emit(
            "victim-location-update",
            location
          );
        }
      );
    }
  );

  // --------------------------------
  // SECURITY GUARD RESPONDS
  // --------------------------------

  socket.on(
    "security-responding",
    (data) => {
      console.log(
        "SECURITY RESPONDING RECEIVED"
      );

      const securityName =
        data.name || "Security Guard";

      console.log(
        `${securityName} is responding to the emergency`
      );

      io.emit("security-response", {
        name: securityName,

        responderName:
          securityName,

        type:
          "Verified Security",

        message:
          "Security is responding",

        timestamp:
          new Date().toISOString(),
      });
    }
  );

  // --------------------------------
  // HOUSEHOLD RESPONDER RESPONDS
  // --------------------------------

  socket.on(
    "responder-responding",
    (data) => {
      const responderName =
        data.name ||
        "Verified Household";

      console.log(
        "HOUSEHOLD RESPONDER RESPONSE RECEIVED"
      );

      console.log(
        `${responderName} is responding to the emergency`
      );

      io.emit(
        "responder-response",
        {
          name:
            responderName,

          type:
            data.type ||
            "Verified Household",

          message:
            `${responderName} is responding`,

          timestamp:
            new Date().toISOString(),
        }
      );
    }
  );

  // --------------------------------
  // INCIDENT RESOLVED
  // --------------------------------

  socket.on(
    "incident-resolved",
    () => {
      console.log(
        "INCIDENT RESOLVED"
      );

      activeResponderNames = [];

      io.emit(
        "incident-resolved",
        {
          message:
            "Incident resolved",

          timestamp:
            new Date().toISOString(),
        }
      );
    }
  );

  // --------------------------------
  // DEVICE DISCONNECTS
  // --------------------------------

  socket.on("disconnect", () => {
    console.log(
      "Device disconnected:",
      socket.id
    );
  });
});

// --------------------------------
// START SERVER
// --------------------------------

const PORT = 5000;

server.listen(PORT, () => {
  console.log(
    "--------------------------------"
  );

  console.log(
    "Beacon250 backend is running"
  );

  console.log(
    `http://localhost:${PORT}`
  );

  console.log(
    "--------------------------------"
  );
});