require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const { startEventSync } = require("./blockchain/eventSync");

async function main() {
  await connectDB();
  startEventSync();

  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
