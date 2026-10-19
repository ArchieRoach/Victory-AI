// Mirrors backend/pro.py so prices shown before checkout match what Stripe charges.
export const BUYER_FEE_FIXED = 0.7;
export const BUYER_FEE_PERCENT = 5;

const round2 = (n) => Math.round(n * 100) / 100;

export function orderTotals(price, shipping = 0, quantity = 1) {
  const item = round2(price * quantity);
  const fee = round2(BUYER_FEE_FIXED + (item * BUYER_FEE_PERCENT) / 100);
  return { item, shipping: round2(shipping), buyerProtection: fee, total: round2(item + shipping + fee) };
}

export const gbp = (n) => `£${Number(n || 0).toFixed(2)}`;

export const ORDER_STATUS = {
  paid: "Paid. Waiting for the fighter to ship",
  shipped: "On its way",
  issue: "Problem reported. We're looking at it",
  received: "Received. Thanks!",
  released: "Complete",
  refunded: "Refunded",
};

export const CLIP_MOMENTS = [
  ["round_start", "Round starts"],
  ["halfway", "Halfway through a round"],
  ["last_10", "Last 10 seconds"],
  ["round_end", "Bell at the end of a round"],
  ["session_done", "Session finished"],
];

export const DIVISIONS = [
  "Minimumweight", "Light flyweight", "Flyweight", "Super flyweight", "Bantamweight", "Super bantamweight",
  "Featherweight", "Super featherweight", "Lightweight", "Super lightweight", "Welterweight", "Super welterweight",
  "Middleweight", "Super middleweight", "Light heavyweight", "Cruiserweight", "Heavyweight",
];

export async function uploadToCloudinary(axios, API, file, kind = "image") {
  const sig = (await axios.get(`${API}/cloudinary/signature?resource_type=${kind}&folder=victory_pro`)).data;
  if (!sig.cloud_name || !sig.api_key) throw new Error("Upload service not configured");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", sig.api_key);
  fd.append("timestamp", sig.timestamp);
  fd.append("signature", sig.signature);
  fd.append("folder", sig.folder);
  const up = await axios.post(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/${kind}/upload`, fd,
    { headers: { "Content-Type": "multipart/form-data" } });
  return up.data.secure_url;
}
