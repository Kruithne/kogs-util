import { expect, test } from '@jest/globals';
import streams from 'node:stream';
import utils from './index.js';
import path from 'node:path';
import fs from 'node:fs';

test('collectFiles functionality', async () => {
	const files = await utils.collectFiles('test');

	expect(files).toHaveLength(4);
	expect(files).toContain(path.join('test', 'foo.txt'));
	expect(files).toContain(path.join('test', 'testC', 'bar.log'));
	expect(files).toContain(path.join('test', 'testC', 'foo.txt'));
	expect(files).toContain(path.join('test', 'testA', 'foo.txt'));
});

test('collectFiles functionality with filter', async () => {
	const files = await utils.collectFiles('test', entry => entry.endsWith('.txt'));

	expect(files).toHaveLength(3);
	expect(files).toContain(path.join('test', 'foo.txt'));
	expect(files).toContain(path.join('test', 'testC', 'foo.txt'));
	expect(files).toContain(path.join('test', 'testA', 'foo.txt'));
});

test('errorClass functionality', () => {
	const myErrorClass = utils.errorClass('MyErrorClass');

	const cause = { foo: 'bar' };
	const error = new myErrorClass('foo', { cause });

	expect(error).toBeInstanceOf(Error);
	expect(error).toBeInstanceOf(myErrorClass);
	expect(error.name).toBe('MyErrorClass');
	expect(error.message).toBe('foo');
	expect(error.cause).toBe(cause);
});

test('streamToArray functionality', async () => {
	const input = [1, 2, 3, 4, 5];
	const stream = new streams.Readable({
		objectMode: true,
		read() {
			for (const content of input)
				this.push(content);

			this.push(null);
		}
	});

	const output = await utils.streamToArray(stream);
	expect(output).toEqual(input);
});

test('streamToBuffer functionality', async () => {
	const input = ['foo', 'bar', 'baz'];
	const stream = new streams.Readable({
		read() {
			for (const content of input)
				this.push(content);

			this.push(null);
		}
	});

	const expected = Buffer.from(input.join(''));
	const buffer = await utils.streamToBuffer(stream);

	expect(buffer).toEqual(expected);
});

test('arrayToStream functionality with objectMode=true', async () => {
	const input = [1, 2, 3, 4, 5];
	const stream = utils.arrayToStream(input, true);
	
	const output = [];
	for await (const chunk of stream)
		output.push(chunk);

	expect(output).toEqual(input);
});

test('arrayToStream functionality with objectMode=false', async () => {
	const input = ['foo', 'bar', 'baz', 'qux'];
	const stream = utils.arrayToStream(input, false);

	const buffers = [];
	for await (const chunk of stream)
		buffers.push(chunk);

	const output = Buffer.concat(buffers).toString();
	expect(output).toEqual(input.join(''));
});

test('mergeStreams() functionality', async () => {
	const stream1Contents = ['a', 'b', 'c'];
	const stream2Contents = ['d', 'e', 'f'];

	const stream1 = utils.arrayToStream(stream1Contents, true);
	const stream2 = utils.arrayToStream(stream2Contents, true);

	const merged = await utils.mergeStreams(stream1, stream2);
	const mergedContents = await utils.streamToArray(merged);

	expect(mergedContents).toStrictEqual([...stream1Contents, ...stream2Contents]);
});

test('filterStream() functionality', async () => {
	const streamContents = ['a', 'b', 'c'];
	const stream1 = utils.arrayToStream(streamContents, true);

	const filtered = stream1.pipe(utils.filterStream(async content => {
		// Wait for 100ms to simulate a slow filter and test async functionality.
		await new Promise(resolve => setTimeout(resolve, 100));
		return content === 'a';
	}));

	const filteredContents = await utils.streamToArray(filtered);
	expect(filteredContents).toStrictEqual(['a']);
});

test('async copy() directory', async () => {
	// Copy an entire directory.
	await utils.copy('test', 'test-copy');

	// Check that the directory was copied.
	const files = await utils.collectFiles('test-copy');
	expect(files).toHaveLength(4);
	expect(files).toContain(path.join('test-copy', 'foo.txt'));
	expect(files).toContain(path.join('test-copy', 'testC', 'bar.log'));
	expect(files).toContain(path.join('test-copy', 'testC', 'foo.txt'));
	expect(files).toContain(path.join('test-copy', 'testA', 'foo.txt'));

	// Check that the contents of the files were copied.
	expect(fs.readFileSync(path.join('test-copy', 'foo.txt'), 'utf8')).toBe('Contents of foo.txt');
	expect(fs.readFileSync(path.join('test-copy', 'testC', 'bar.log'), 'utf8')).toBe('Contents of bar.log');
	expect(fs.readFileSync(path.join('test-copy', 'testC', 'foo.txt'), 'utf8')).toBe('Contents of foo.txt');
	expect(fs.readFileSync(path.join('test-copy', 'testA', 'foo.txt'), 'utf8')).toBe('Contents of foo.txt');

	// Delete the copied directory.
	await fs.promises.rmdir('test-copy', { recursive: true });
});

test('async copy() single file', async () => {
	// Copy a single file.
	await utils.copy('test/foo.txt', 'test-copy.txt');

	// Check that the file was copied.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Delete the copied file.
	await fs.promises.unlink('test-copy.txt');
});

test('async copy() with options.overwrite=false', async () => {
	// Copy a single file.
	await utils.copy('test/foo.txt', 'test-copy.txt', { overwrite: false });

	// Check that the file was copied.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Copy a different file to the same destination (should not throw).
	await utils.copy('test/testC/bar.log', 'test-copy.txt', { overwrite: false });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Attempt to copy a directory to the same destination.
	await utils.copy('test', 'test-copy.txt', { overwrite: false });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Delete the file.
	await fs.promises.unlink('test-copy.txt');

	// Copy a directory.
	await utils.copy('test', 'test-copy', { overwrite: false });

	// Attempt to copy a file to the same destination.
	await utils.copy('test/foo.txt', 'test-copy', { overwrite: false });

	// Check that the directory still exists.
	expect(fs.statSync('test-copy').isDirectory()).toBe(true);
});

test('copySync() with options.overwrite=false', () => {
	// Copy a single file.
	utils.copySync('test/foo.txt', 'test-copy.txt', { overwrite: false });

	// Check that the file was copied.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Copy a different file to the same destination (should not throw).
	utils.copySync('test/testC/bar.log', 'test-copy.txt', { overwrite: false });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Attempt to copy a directory to the same destination.
	utils.copySync('test', 'test-copy.txt', { overwrite: false });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Delete the file.
	fs.unlinkSync('test-copy.txt');

	// Copy a directory.
	utils.copySync('test', 'test-copy', { overwrite: false });

	// Attempt to copy a file to the same destination.
	utils.copySync('test/foo.txt', 'test-copy', { overwrite: false });

	// Check that the directory still exists.
	expect(fs.statSync('test-copy').isDirectory()).toBe(true);
});

test('async copy() with options.overwrite=never', async () => {
	// Copy a single file.
	await utils.copy('test/foo.txt', 'test-copy.txt', { overwrite: 'never' });

	// Check that the file was copied.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Copy a different file to the same destination (should not throw).
	await utils.copy('test/testC/bar.log', 'test-copy.txt', { overwrite: 'never' });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Attempt to copy a directory to the same destination.
	await utils.copy('test', 'test-copy.txt', { overwrite: 'never' });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Delete the file.
	await fs.promises.unlink('test-copy.txt');

	// Copy a directory.
	await utils.copy('test', 'test-copy', { overwrite: 'never' });

	// Attempt to copy a file to the same destination.
	await utils.copy('test/foo.txt', 'test-copy', { overwrite: 'never' });

	// Check that the directory still exists.
	expect(fs.statSync('test-copy').isDirectory()).toBe(true);

	// Delete the directory.
	await fs.promises.rmdir('test-copy', { recursive: true });
});

test('copySync() with options.overwrite=never', () => {
	// Copy a single file.
	utils.copySync('test/foo.txt', 'test-copy.txt', { overwrite: 'never' });

	// Check that the file was copied.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Copy a different file to the same destination (should not throw).
	utils.copySync('test/testC/bar.log', 'test-copy.txt', { overwrite: 'never' });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Attempt to copy a directory to the same destination.
	utils.copySync('test', 'test-copy.txt', { overwrite: 'never' });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Delete the file.
	fs.unlinkSync('test-copy.txt');

	// Copy a directory.
	utils.copySync('test', 'test-copy', { overwrite: 'never' });

	// Attempt to copy a file to the same destination.
	utils.copySync('test/foo.txt', 'test-copy', { overwrite: 'never' });

	// Check that the directory still exists.
	expect(fs.statSync('test-copy').isDirectory()).toBe(true);

	// Delete the directory.
	fs.rmdirSync('test-copy', { recursive: true });
});

test('async copy() with options.overwrite=newer', async () => {
	// Create a new file called test-data.txt
	fs.writeFileSync('test-data.txt', 'Contents of test-data.txt');

	// Copy the file to test-data-copy.txt.
	await utils.copy('test-data.txt', 'test-data-copy.txt', { overwrite: 'newer' });

	// Set the mtime of test-data.txt to 10 seconds in the past.
	// This ensures that the file is older than test-data-copy.txt.
	fs.utimesSync('test-data.txt', Date.now() / 1000 - 10, Date.now() / 1000 - 10);

	// Check that the file was copied and the contents are correct.
	expect(fs.readFileSync('test-data-copy.txt', 'utf8')).toBe('Contents of test-data.txt');

	// Write new contents to test-data-copy.txt
	fs.writeFileSync('test-data-copy.txt', 'New contents of test-data-copy.txt');

	// Attempt to copy test-data.txt to test-data-copy.txt.
	await utils.copy('test-data.txt', 'test-data-copy.txt', { overwrite: 'newer' });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-data-copy.txt', 'utf8')).toBe('New contents of test-data-copy.txt');

	// Set the mtime of test-data.txt to 10 seconds in the future.
	fs.utimesSync('test-data.txt', Date.now() / 1000 + 10, Date.now() / 1000 + 10);

	// Attempt to copy test-data.txt to test-data-copy.txt.
	await utils.copy('test-data.txt', 'test-data-copy.txt', { overwrite: 'newer' });

	// Check that the file was overwritten.
	expect(fs.readFileSync('test-data-copy.txt', 'utf8')).toBe('Contents of test-data.txt');

	// Delete both files.
	await fs.promises.unlink('test-data.txt');
	await fs.promises.unlink('test-data-copy.txt');
});

test('copySync() with options.overwrite=newer', () => {
	// Create a new file called test-data.txt
	fs.writeFileSync('test-data.txt', 'Contents of test-data.txt');

	// Copy the file to test-data-copy.txt.
	utils.copySync('test-data.txt', 'test-data-copy.txt', { overwrite: 'newer' });

	// Set the mtime of test-data.txt to 10 seconds in the past.
	// This ensures that the file is older than test-data-copy.txt.
	fs.utimesSync('test-data.txt', Date.now() / 1000 - 10, Date.now() / 1000 - 10);

	// Check that the file was copied and the contents are correct.
	expect(fs.readFileSync('test-data-copy.txt', 'utf8')).toBe('Contents of test-data.txt');

	// Write new contents to test-data-copy.txt
	fs.writeFileSync('test-data-copy.txt', 'New contents of test-data-copy.txt');

	// Attempt to copy test-data.txt to test-data-copy.txt.
	utils.copySync('test-data.txt', 'test-data-copy.txt', { overwrite: 'newer' });

	// Check that the file was not overwritten.
	expect(fs.readFileSync('test-data-copy.txt', 'utf8')).toBe('New contents of test-data-copy.txt');

	// Set the mtime of test-data.txt to 10 seconds in the future
	fs.utimesSync('test-data.txt', Date.now() / 1000 + 10, Date.now() / 1000 + 10);

	// Attempt to copy test-data.txt to test-data-copy.txt.
	utils.copySync('test-data.txt', 'test-data-copy.txt', { overwrite: 'newer' });

	// Check that the file was overwritten.
	expect(fs.readFileSync('test-data-copy.txt', 'utf8')).toBe('Contents of test-data.txt');

	// Delete both files.
	fs.unlinkSync('test-data.txt');
	fs.unlinkSync('test-data-copy.txt');
});

test('copySync() directory', async () => {
	// Copy an entire directory.
	utils.copySync('test', 'test-copy');

	// Check that the directory was copied.
	const files = await utils.collectFiles('test-copy');
	expect(files).toHaveLength(4);
	expect(files).toContain(path.join('test-copy', 'foo.txt'));
	expect(files).toContain(path.join('test-copy', 'testC', 'bar.log'));
	expect(files).toContain(path.join('test-copy', 'testC', 'foo.txt'));
	expect(files).toContain(path.join('test-copy', 'testA', 'foo.txt'));

	// Check that the contents of the files were copied.
	expect(fs.readFileSync(path.join('test-copy', 'foo.txt'), 'utf8')).toBe('Contents of foo.txt');
	expect(fs.readFileSync(path.join('test-copy', 'testC', 'bar.log'), 'utf8')).toBe('Contents of bar.log');
	expect(fs.readFileSync(path.join('test-copy', 'testC', 'foo.txt'), 'utf8')).toBe('Contents of foo.txt');
	expect(fs.readFileSync(path.join('test-copy', 'testA', 'foo.txt'), 'utf8')).toBe('Contents of foo.txt');

	// Delete the copied directory.
	fs.rmdirSync('test-copy', { recursive: true });
});

test('copySync() single file', () => {
	// Copy a single file.
	utils.copySync('test/foo.txt', 'test-copy.txt');

	// Check that the file was copied.
	expect(fs.readFileSync('test-copy.txt', 'utf8')).toBe('Contents of foo.txt');

	// Delete the copied file.
	fs.unlinkSync('test-copy.txt');
});