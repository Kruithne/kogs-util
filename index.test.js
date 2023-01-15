import streams from 'node:stream';
import utils from './index.js';

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