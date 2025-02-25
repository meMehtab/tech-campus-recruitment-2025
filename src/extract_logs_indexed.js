const fs = require('fs');
const readline = require('readline');
const path = require('path');

// --------------------------------------------------------------------------
// Check for required argument: target date (YYYY-MM-DD)
if (process.argv.length < 3) {
  console.error("Usage: node extract_logs_indexed.js <YYYY-MM-DD>");
  process.exit(1);
}

const targetDate = process.argv[2];
const logFilePath = path.join(__dirname, "../logs_2024.log");  // Update as needed
const outputDir = path.join(__dirname, "../output");
const indexDir = path.join(__dirname, "../index");
const outputFile = path.join(outputDir, `output_${targetDate}.txt`);
const indexFilePath = path.join(indexDir, "../log_index.json");

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// --------------------------------------------------------------------------
// A helper function to transform a log line from ISO style to a more human-friendly format.
//
// Expected input example:
//   "2024-12-02T02:23:37.0000 - DEBUG - Cache cleared successfully."
// Desired output example:
//   "2024-12-02 02:23:37 DEBUG Cache cleared successfully."
function transformLine(line) {
  const regex = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\.\d+\s*-\s*([A-Z]+)\s*-\s*(.*)$/;
  const match = line.match(regex);
  if (match) {
    const [ , date, time, level, message ] = match;
    return `${date} ${time} ${level} ${message}`;
  }
  // If the line doesn't match our expected format, return it unchanged.
  return line;
}

// --------------------------------------------------------------------------
// Build an index mapping each date (YYYY-MM-DD) to its byte-offset range in the log file.
// This function scans the entire file once and records the starting and ending offset
// of each contiguous block of logs for a given date.
async function buildIndex() {
  return new Promise((resolve, reject) => {
    const index = {};
    let currentDate = null;
    let currentStart = 0;
    let currentOffset = 0;
    
    const readStream = fs.createReadStream(logFilePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });
    
    rl.on('line', (line) => {
      // Compute the byte length of the current line plus one for the newline.
      const lineByteLength = Buffer.byteLength(line, 'utf8') + 1; 
      
      // Extract the date from the first 10 characters of the line.
      const lineDate = line.substring(0, 10);
      
      if (!currentDate) {
        // This is the first line in the file.
        currentDate = lineDate;
        currentStart = currentOffset;
      }
      
      // When the date changes, record the range for the previous date.
      if (lineDate !== currentDate) {
        index[currentDate] = { start: currentStart, end: currentOffset - 1 };
        // Start a new block for the new date.
        currentDate = lineDate;
        currentStart = currentOffset;
      }
      
      // Update the offset by the byte length of this line.
      currentOffset += lineByteLength;
    });
    
    rl.on('close', () => {
      // Capture the last date's block.
      if (currentDate) {
        index[currentDate] = { start: currentStart, end: currentOffset - 1 };
      }
      resolve(index);
    });
    
    rl.on('error', (err) => {
      reject(err);
    });
  });
}

// --------------------------------------------------------------------------
// Get the index from cache if available; otherwise, build it and cache it to disk.
async function getIndex() {
  if (fs.existsSync(indexFilePath)) {
    try {
      const data = fs.readFileSync(indexFilePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error("Error reading index file; rebuilding index:", err);
    }
  }
  
  console.log("Building index for the log file (this may take a while)...");
  const index = await buildIndex();
  // Save the built index to disk for faster future queries.
  try {
    fs.writeFileSync(indexFilePath, JSON.stringify(index, null, 2), 'utf8');
    console.log("Index built and cached successfully.");
  } catch (err) {
    console.error("Error writing index file:", err);
  }
  return index;
}

// --------------------------------------------------------------------------
// Extract logs for the target date using the pre-built index and transform each log line.
async function extractLogs() {
  try {
    const index = await getIndex();
    
    if (!index[targetDate]) {
      console.log(`No logs found for ${targetDate}.`);
      return;
    }
    
    const { start, end } = index[targetDate];
    console.log(`Extracting logs for ${targetDate} (bytes ${start} to ${end})...`);
    
    // Create a stream that only reads the block of data for the target date.
    const readStream = fs.createReadStream(logFilePath, { encoding: 'utf8', start, end });
    const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });
    const writeStream = fs.createWriteStream(outputFile, { encoding: 'utf8' });
    
    for await (const line of rl) {
      // Transform the line if needed, then write it.
      const transformed = transformLine(line);
      writeStream.write(transformed + '\n');
    }
    
    writeStream.end(() => {
      console.log(`Logs for ${targetDate} extracted successfully to ${outputFile}`);
    });
    
  } catch (err) {
    console.error("Error during log extraction:", err);
  }
}

// --------------------------------------------------------------------------
// Start the extraction process.
extractLogs();
