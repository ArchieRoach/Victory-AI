import { sendsToken } from "./authTarget";

const API = "https://victory-ai-backend-production.up.railway.app";

test("the sign-in token only goes to our own server", () => {
  expect(sendsToken(`${API}/api/training/start`, API)).toBe(true);
  expect(sendsToken("/api/health", API)).toBe(true);
  expect(sendsToken("https://api.cloudinary.com/v1_1/x/video/upload", API)).toBe(false);
  expect(sendsToken("https://image.pollinations.ai/prompt/x", API)).toBe(false);
  expect(sendsToken("https://victory-ai-backend-production.up.railway.app.evil.com/x", API)).toBe(false);
  expect(sendsToken("", API)).toBe(false);
});
