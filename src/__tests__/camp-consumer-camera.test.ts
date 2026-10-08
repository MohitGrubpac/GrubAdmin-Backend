import { describe, expect, test, mock, beforeEach } from "bun:test";
import { APIError } from "@/types/error";

const mockPrisma = {
	vertical_camping_consumer_box: {
		findFirst: mock(() =>
			Promise.resolve({
				box: {
					id: "box-1",
					box_display_id: "CAMP-001",
					name: "Camp Box",
					client_id: "client-camp",
				},
			}),
		),
	},
	box_telemetry_latest: {
		findUnique: mock(() =>
			Promise.resolve({
				camera_status: "on",
				surveillance_enabled: false,
			}),
		),
		upsert: mock(() => Promise.resolve({ surveillance_enabled: true })),
	},
	camp_camera_feed: {
		findMany: mock(() => Promise.resolve([])),
		findFirst: mock(() => Promise.resolve(null)),
		create: mock((args: { data: Record<string, unknown> }) =>
			Promise.resolve({
				id: args.data.id ?? "feed-new",
				box_id: args.data.box_id,
				cam_id: args.data.cam_id,
				s3_key: args.data.s3_key,
				thumbnail_key: args.data.thumbnail_key ?? null,
				recorded_at: args.data.recorded_at,
				duration_sec: args.data.duration_sec ?? null,
			}),
		),
	},
};

const mockS3 = {
	objectExists: mock(() => Promise.resolve(true)),
	getPresignedUrl: mock((key: string) => Promise.resolve(`https://signed.example/${key}`)),
	getPresignedPutUrl: mock((key: string) => Promise.resolve(`https://put.example/${key}`)),
};

mock.module("@/db", () => ({
	prisma: mockPrisma,
	isPrismaConnected: () => true,
	isPostgresDatabaseUrl: () => false,
	waitForDatabases: async () => ({ prisma: true, mongodb: true }),
	isMongoConnected: () => true,
	getMongoConnectionState: () => "connected",
}));

mock.module("@/services", () => ({
	services: { s3: mockS3 },
}));

process.env.AWS_BUCKET_NAME = "test-bucket";
process.env.CAMERA_S3_PREFIX = "camp-camera";

const cameraActions = await import("@/db/actions/camp-consumer/camera.actions.ts");

const CLIENT_PREFIX =
	"camp-camera/camp-consumer/clients/client-camp/boxes/box-1";

describe("Camp consumer camera endpoints (S3-backed)", () => {
	beforeEach(() => {
		mockPrisma.vertical_camping_consumer_box.findFirst.mockImplementation(() =>
			Promise.resolve({
				box: {
					id: "box-1",
					box_display_id: "CAMP-001",
					name: "Camp Box",
					client_id: "client-camp",
				},
			}),
		);
		mockPrisma.box_telemetry_latest.findUnique.mockClear();
		mockPrisma.camp_camera_feed.findMany.mockClear();
		mockPrisma.camp_camera_feed.findFirst.mockImplementation(() => Promise.resolve(null));
		mockPrisma.camp_camera_feed.create.mockClear();
		mockS3.objectExists.mockClear();
		mockS3.getPresignedUrl.mockClear();
		mockS3.getPresignedPutUrl.mockClear();
		mockS3.objectExists.mockResolvedValue(true);
	});

	test("live camera returns presigned URL and cam_id with client-scoped S3 path", async () => {
		const data = await cameraActions.getConsumerCameraLive({
			box_id: "box-1",
			consumer_id: "consumer-a",
			client_id: "client-camp",
			cam: 2,
		});

		expect(Object.keys(data).sort()).toEqual(
			["box_display_id", "cam_id", "expires_at", "mode", "stream_url"].sort(),
		);
		expect(data.cam_id).toBe(2);
		expect(data.stream_url).toContain("signed.example");
		expect(data.mode).toBe("live");
		expect(mockS3.objectExists).toHaveBeenCalledWith(`${CLIENT_PREFIX}/cam2/live.m3u8`);
	});

	test("feeds list returns empty array when no DB rows", async () => {
		mockPrisma.camp_camera_feed.findMany.mockResolvedValue([]);

		const data = await cameraActions.listConsumerCameraFeeds({
			box_id: "box-1",
			consumer_id: "consumer-a",
			client_id: "client-camp",
		});

		expect(data.feeds).toEqual([]);
	});

	test("stream playback 404 when feed not in DB", async () => {
		mockPrisma.camp_camera_feed.findFirst.mockResolvedValue(null);

		await expect(
			cameraActions.getConsumerCameraStream({
				box_id: "box-1",
				feed_id: "missing-feed",
				consumer_id: "consumer-a",
				client_id: "client-camp",
			}),
		).rejects.toThrow(APIError);
	});

	test("stream rejects s3_key outside client/box prefix", async () => {
		mockPrisma.camp_camera_feed.findFirst.mockResolvedValue({
			id: "feed-1",
			box_id: "box-1",
			cam_id: 1,
			s3_key: "camp-camera/camp-consumer/other-client/boxes/box-1/cam1/recordings/feed-1/index.m3u8",
		} as never);

		await expect(
			cameraActions.getConsumerCameraStream({
				box_id: "box-1",
				feed_id: "feed-1",
				consumer_id: "consumer-a",
				client_id: "client-camp",
			}),
		).rejects.toThrow(APIError);
	});

	test("surveillance mode persists via telemetry upsert", async () => {
		const data = await cameraActions.patchConsumerSurveillanceMode({
			box_id: "box-1",
			consumer_id: "consumer-a",
			client_id: "client-camp",
			enabled: true,
		});

		expect(data.surveillance_enabled).toBe(true);
		expect(mockPrisma.box_telemetry_latest.upsert).toHaveBeenCalled();
	});

	test("live camera 404 when S3 object missing", async () => {
		mockS3.objectExists.mockResolvedValue(false);

		await expect(
			cameraActions.getConsumerCameraLive({
				box_id: "box-1",
				consumer_id: "consumer-a",
				client_id: "client-camp",
			}),
		).rejects.toThrow(APIError);
	});

	test("camera actions reject boxes not assigned to consumer", async () => {
		mockPrisma.vertical_camping_consumer_box.findFirst.mockResolvedValue(null as never);

		await expect(
			cameraActions.getConsumerCameraLive({
				box_id: "box-other",
				consumer_id: "consumer-b",
				client_id: "client-camp",
			}),
		).rejects.toThrow(APIError);
	});

	test("upload-url returns presigned PUT for live ingest", async () => {
		const data = await cameraActions.createConsumerCameraUploadUrl({
			box_id: "box-1",
			consumer_id: "consumer-a",
			client_id: "client-camp",
			kind: "live",
			cam_id: 1,
		});

		expect(data.kind).toBe("live");
		expect(data.s3_key).toBe(`${CLIENT_PREFIX}/cam1/live.m3u8`);
		expect(data.upload_url).toContain("put.example");
		expect(data.feed_id).toBeNull();
		expect(mockS3.getPresignedPutUrl).toHaveBeenCalled();
	});

	test("upload-url generates feed_id for recording ingest", async () => {
		const data = await cameraActions.createConsumerCameraUploadUrl({
			box_id: "box-1",
			consumer_id: "consumer-a",
			client_id: "client-camp",
			kind: "recording",
			cam_id: 3,
		});

		expect(data.kind).toBe("recording");
		expect(data.feed_id).toBeTruthy();
		expect(data.s3_key).toBe(
			`${CLIENT_PREFIX}/cam3/recordings/${data.feed_id}/index.m3u8`,
		);
	});

	test("upload-url uses provided feed_id for thumbnail ingest", async () => {
		const data = await cameraActions.createConsumerCameraUploadUrl({
			box_id: "box-1",
			consumer_id: "consumer-a",
			client_id: "client-camp",
			kind: "thumbnail",
			cam_id: 2,
			feed_id: "feed-thumb-1",
			filename: "preview.jpg",
		});

		expect(data.s3_key).toBe(
			`${CLIENT_PREFIX}/cam2/recordings/feed-thumb-1/preview.jpg`,
		);
	});

	test("register feed creates camp_camera_feed with validated s3_key", async () => {
		const s3_key = `${CLIENT_PREFIX}/cam1/recordings/feed-reg-1/index.m3u8`;

		const data = await cameraActions.registerConsumerCameraFeed({
			box_id: "box-1",
			consumer_id: "consumer-a",
			client_id: "client-camp",
			cam_id: 1,
			s3_key,
			thumbnail_key: `${CLIENT_PREFIX}/cam1/recordings/feed-reg-1/thumbnail.jpg`,
			recorded_at: "2026-08-12T10:00:00.000Z",
			duration_sec: 120,
		});

		expect(data.feed_id).toBe("feed-reg-1");
		expect(data.s3_key).toBe(s3_key);
		expect(mockPrisma.camp_camera_feed.create).toHaveBeenCalled();
	});

	test("register feed rejects s3_key outside client/box prefix", async () => {
		await expect(
			cameraActions.registerConsumerCameraFeed({
				box_id: "box-1",
				consumer_id: "consumer-a",
				client_id: "client-camp",
				cam_id: 1,
				s3_key: "camp-camera/camp-consumer/clients/wrong/boxes/box-1/cam1/recordings/x/index.m3u8",
				recorded_at: "2026-08-12T10:00:00.000Z",
			}),
		).rejects.toThrow(APIError);
	});

	test("assertKeyBelongsToClient accepts keys under client/box prefix", () => {
		expect(() =>
			cameraActions.assertKeyBelongsToClient(
				`${CLIENT_PREFIX}/cam1/live.m3u8`,
				"client-camp",
				"box-1",
			),
		).not.toThrow();
	});
});
