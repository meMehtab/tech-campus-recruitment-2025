const fs = require('fs');
const readline = require('readline');
const path = require('path');


if (process.argv.length < 3) {
    console.error("Usage: node extract_logs.js <YYYY-MM-DD>");
    process.exit(1);
}

const targetDate = process.argv[2]; 
const logFilePath = "../logs_2024.log";  
const outputDir = "../output";
const outputFile = path.join(outputDir, `output_${targetDate}.txt`);


if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Transform a log line from ISO format to a human-readable format.
 *
 * Expected input format:
 *   YYYY-MM-DDT hh:mm:ss.milliseconds - LEVEL - message
 *
 * Desired output format:
 *   YYYY-MM-DD hh:mm:ss LEVEL message
 *
 * For example:
 *   "2024-12-02T02:23:37.0000 - DEBUG - Cache cleared successfully."
 * becomes:
 *   "2024-12-02 02:23:37 DEBUG Cache cleared successfully."
 *
 * @param {string} line - A single log line from the file.
 * @returns {string|null} - The transformed log line, or null if the line doesn't match.
 */
function transformLine(line) {
    const regex = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\.\d+\s*-\s*([A-Z]+)\s*-\s*(.*)$/;
    const match = line.match(regex);
    if (match) {
        const [, date, time, level, message] = match;
        return `${date} ${time} ${level} ${message}`;
    }
    
    return null;
}

/**
 * Asynchronously reads the log file line-by-line, filters and transforms the matching lines,
 * then writes the output to a file.
 */
async function extractLogs() {
    const readStream = fs.createReadStream(logFilePath, { encoding: 'utf8' });
    const writeStream = fs.createWriteStream(outputFile, { encoding: 'utf8' });
    
    
    const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity, 
    });
    
    console.log(`Extracting logs for ${targetDate}...`);
    
    
    for await (const line of rl) {
        
        if (line.startsWith(targetDate)) {
            const transformed = transformLine(line);
            if (transformed) {
                writeStream.write(transformed + '\n');
            }
        }
    }
    
    writeStream.end(() => {
        console.log(`Logs for ${targetDate} extracted and transformed successfully to ${outputFile}`);
    });
}


extractLogs().catch((err) => {
    console.error("Error during extraction:", err);
});
