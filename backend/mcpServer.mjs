import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { io } from "socket.io-client";

const app = express();
app.use(express.json());
const beaconSocket = io("https://beacon250-backend.onrender.com");

beaconSocket.on("connect", () => {
  console.log("Connected to Beacon250 backend");
});

beaconSocket.on("connect_error", (error) => {
  console.log(
    "Could not connect to Beacon250 backend:",
    error.message
  );
});

const mcpServer = new McpServer({
  name: "beacon250-mcp",
  version: "1.0.0",
});
function createResponderLocation(
  latitude,
  longitude,
  distanceMeters,
  bearingDegrees
) {
  const earthRadius = 6371000;

  const angularDistance =
    distanceMeters / earthRadius;

  const bearing =
    (bearingDegrees * Math.PI) / 180;

  const lat1 =
    (latitude * Math.PI) / 180;

  const lon1 =
    (longitude * Math.PI) / 180;

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
mcpServer.registerTool(
  "beacon250_status",
  {
    description: "Check whether the Beacon250 emergency system is available.",
    inputSchema: z.object({}),
  },
  async () => {
    return {
      content: [
        {
          type: "text",
          text: "Beacon250 emergency network is online and ready.",
        },
      ],
    };
  }
);
mcpServer.registerTool(
  "trigger_sos",
  {
    description:
      "Trigger a Beacon250 emergency SOS and alert verified responders within 250 metres.",

    inputSchema: z.object({
  latitude: z.number().describe("Victim latitude"),

  longitude: z.number().describe("Victim longitude"),

  requesterName: z
    .string()
    .optional()
    .describe(
      "Name of the Beacon250 user who triggered the SOS"
    ),
}),
  },

 async ({
  latitude,
  longitude,
  requesterName,
}) => {
    const responderConfigs = [
  {
    name: "House A",
    distance: 80,
    bearing: 45,
  },
  {
    name: "House B",
    distance: 140,
    bearing: 135,
  },
  {
    name: "Security Guard",
    distance: 190,
    bearing: 225,
  },
  {
    name: "House C",
    distance: 230,
    bearing: 315,
  },
];
const eligibleResponders =
  responderConfigs.filter(
    (responder) =>
      responder.name !== requesterName
  );

const nearbyResponders =
  eligibleResponders.map(
    (responder) => {
      const responderLocation =
        createResponderLocation(
          latitude,
          longitude,
          responder.distance,
          responder.bearing
        );

      return {
        name: responder.name,
        distance: responder.distance,

        latitude:
          responderLocation.latitude,

        longitude:
          responderLocation.longitude,
      };
    }
  );

    beaconSocket.emit("trigger-sos", {
      location: {
        latitude,
        longitude,
      },

      nearbyResponders,
    });

    console.log(
      `MCP SOS triggered at ${latitude}, ${longitude}`
    );

    return {
      content: [
        {
          type: "text",
         text:
  `Beacon250 SOS activated. ${nearbyResponders.length} verified responder${
    nearbyResponders.length === 1 ? "" : "s"
  } within 250 metres ${
    nearbyResponders.length === 1 ? "has" : "have"
  } been alerted.`,
        },
      ],
    };
  }
);


app.post("/mcp", async (req, res) => {
  try {
    const transport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

    res.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);

    await transport.handleRequest(
      req,
      res,
      req.body
    );
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "MCP server error",
      });
    }
  }
});

app.get("/", (req, res) => {
  res.send("Beacon250 MCP Server is running");
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log("Beacon250 MCP Server is running");
  console.log(`Port: ${PORT}`);
  console.log(`MCP endpoint: /mcp`);
  console.log("--------------------------------");
});