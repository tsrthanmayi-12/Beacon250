import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({
  name: "beacon250-test-client",
  version: "1.0.0",
});

const transport =
  new StreamableHTTPClientTransport(
    new URL("http://localhost:5001/mcp")
  );

try {
  console.log("Connecting to Beacon250 MCP...");

  await client.connect(transport);

  console.log("Connected successfully.");

  const tools = await client.listTools();

  console.log("\nAvailable MCP tools:");
  console.log(
    tools.tools.map((tool) => tool.name)
  );

  const result = await client.callTool({
    name: "beacon250_status",
    arguments: {},
  });

  console.log("\nTool result:");
console.log(
  result.content?.[0]?.text
);

console.log("\nTriggering Beacon250 SOS through MCP...");

const sosResult = await client.callTool({
  name: "trigger_sos",
  arguments: {
    latitude: 12.9716,
    longitude: 77.5946,
  },
});

console.log("\nSOS result:");
console.log(
  sosResult.content?.[0]?.text
);

await client.close();
} catch (error) {
  console.error("MCP TEST FAILED:");
  console.error(error);
}