import stream from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';

type ReadableChunk = string | Buffer | Uint8Array | null;
type StreamFilter = (chunk: ReadableChunk) => Promise<boolean>;

type FileFilter = (entryPath: string) => boolean;

/**
 * Generates a new error class with the given name.
 * @param name - Name of the error class.
 * @returns A new error class with the given name.
 */
export function errorClass(name: string): new() => Error {
	return class extends Error {
		/**
		 * Creates a new error instance with the given message and options.
		 * @param message - Error message.
		 * @param options - Additional options.
		 */
		constructor(message?: string, options?: object) {
			super(message, options);
			this.name = name;
		}
	};
}

/**
 * Recursively scans the given directory and returns an array of file paths.
 * @param dir - Directory to be scanned.
 * @param filter - Optional filter function that returns true if the file should be included in the result, and false otherwise.
 * @returns An array of file paths.
 */
export async function collectFiles(dir: string, filter?: FileFilter): Promise<string[]> {
	const entries: string[] = [];

	const collect = async (dir: string): Promise<void> => {
		const dirEntries = await fs.promises.readdir(dir, { withFileTypes: true });

		for (const entry of dirEntries) {
			const entryPath = path.join(dir, entry.name);

			if (entry.isDirectory())
				await collect(entryPath);
			else if (!filter || filter(entryPath))
				entries.push(entryPath);
		}
	};

	await collect(dir);

	return entries;
}

/**
 * Creates a readable stream and pushes the given array of chunks to it.
 * @param input - Array of chunks to be pushed to the stream.
 * @param objectMode - If true, the stream will be in object mode. If false, the stream will be in buffer mode. If undefined, the stream will be in object mode if the first element of the array is an object, and in buffer mode otherwise.
 * @returns A readable stream that will emit the given array of chunks.
 */
export function arrayToStream(input: Array<ReadableChunk>, objectMode?: boolean): stream.Readable {
	// If objectMode is not specified, try to guess it from the first element.
	if (objectMode === undefined) {
		const first = input[0];
		objectMode = typeof first === 'object' && first !== null;
	}

	return new stream.Readable({
		objectMode,
		read() {
			for (const element of input)
				this.push(element);

			this.push(null);
		}
	});
}

/**
 * Consumes a readable stream and returns an array of chunks emitted by the stream.
 * @param input - Readable stream to be converted to an array.
 * @returns An array of chunks emitted by the stream.
 */
export async function streamToArray(input: stream.Readable): Promise<Array<ReadableChunk>> {
	const output: Array<ReadableChunk> = [];

	for await (const chunk of input)
		output.push(chunk);

	return output;
}

/**
 * Consumes a readable stream and returns a buffer containing the data emitted by the stream.
 * @param input - Readable stream to be converted to a buffer.
 * @returns A buffer containing the data emitted by the stream.
 */
export async function streamToBuffer(input: stream.Readable): Promise<Buffer> {
	const output: Array<Buffer> = [];

	for await (let chunk of input) {
		// Convert non-buffer chunks.
		if (!Buffer.isBuffer(chunk))
			chunk = Buffer.from(chunk);

		output.push(chunk);
	}

	return Buffer.concat(output);
}

/**
 * Creates a transform stream that filters chunks based on the given function.
 * @param fn - Function that returns true if the chunk should be passed through the stream, and false otherwise.
 * @param objectMode - If true, the stream will be in object mode. If false, the stream will be in buffer mode.
 * @returns A transform stream that filters chunks based on the given function.
 */
export function filterStream(fn: StreamFilter, objectMode: boolean = true): stream.Transform {
	return new stream.Transform({
		objectMode,
		async transform(chunk: ReadableChunk, encoding: string, callback: stream.TransformCallback) {
			if (await fn(chunk))
				this.push(chunk);

			callback();
		}
	});
}

/**
 * Merges the given streams into a single stream.
 * @param streams - Streams to be merged.
 * @returns A stream containing the data emitted by the given streams.
 */
export async function mergeStreams(...streams: Array<stream.Readable>): Promise<stream.PassThrough> {
	const merged = new stream.PassThrough({ objectMode: true });

	let ended = 0;
	for (const stream of streams) {
		for await (const data of stream)
			merged.write(data);

		ended += 1;

		if (ended === streams.length)
			merged.end();
	}

	return merged;
}

export default {
	collectFiles,
	errorClass,
	arrayToStream,
	streamToArray,
	streamToBuffer,
	filterStream,
	mergeStreams
};