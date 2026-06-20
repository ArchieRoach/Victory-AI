import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ArrowLeft, Video, Upload, X, Swords, Dumbbell, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

const POST_TYPES = [
  { key: "clip", icon: Dumbbell, labelKey: "createPost.typeClip" },
  { key: "competition_result", icon: Swords, labelKey: "createPost.typeCompete" },
  { key: "training_log", icon: BookOpen, labelKey: "createPost.typeLog" },
];

const COMMON_TAGS = ["shadowboxing", "bagwork", "padwork", "sparring", "technique", "drills", "beginner", "advanced"];

export default function CreatePostPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isCompeteMode = searchParams.get("mode") === "compete";

  const [postType, setPostType] = useState(isCompeteMode ? "competition_result" : "clip");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Competition-specific
  const [compTitle, setCompTitle] = useState("");
  const [compDesc, setCompDesc] = useState("");
  const [compType, setCompType] = useState("poll");
  const [duration, setDuration] = useState(24);

  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) return toast.error(t("createPost.videoOnly"));
    if (file.size > 200 * 1024 * 1024) return toast.error(t("createPost.fileTooLarge"));
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const toggleTag = (tag) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const uploadVideo = async () => {
    if (!videoFile) return null;
    try {
      const sigRes = await axios.get(`${API}/cloudinary/signature?resource_type=video`);
      const { signature, timestamp, cloud_name, api_key, folder } = sigRes.data;
      if (!cloud_name || !api_key) return null;

      const formData = new FormData();
      formData.append("file", videoFile);
      formData.append("api_key", api_key);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);
      formData.append("folder", folder);
      formData.append("resource_type", "video");

      const uploadRes = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => setUploadProgress(Math.round((e.loaded * 100) / e.total)),
        }
      );
      return uploadRes.data.secure_url;
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (isCompeteMode && !compTitle.trim()) return toast.error(t("createPost.titleRequired"));
    if (!videoFile && isCompeteMode) return toast.error(t("createPost.videoRequired"));

    setUploading(true);
    try {
      let videoUrl = null;
      if (videoFile) {
        videoUrl = await uploadVideo();
        if (!videoUrl && videoFile) {
          toast.error(t("createPost.uploadFailed"));
          setUploading(false);
          return;
        }
      }

      if (isCompeteMode || postType === "competition_result") {
        const res = await axios.post(`${API}/competitions`, {
          title: compTitle.trim(),
          description: compDesc,
          video_url: videoUrl,
          competition_type: compType,
          duration_hours: duration,
        });
        toast.success(t("createPost.challengePosted"));
        navigate(`/compete/${res.data.comp_id}`);
      } else {
        await axios.post(`${API}/posts`, {
          video_url: videoUrl,
          caption,
          post_type: postType,
          tags,
        });
        toast.success(t("createPost.posted"));
        navigate("/feed");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("common.error"));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const isCompete = isCompeteMode || postType === "competition_result";
  const canSubmit = isCompete ? compTitle.trim().length > 0 : caption.trim().length > 0 || videoFile;

  return (
    <div className="min-h-screen bg-victory-bg pb-40" data-testid="create-post-page">
      <header className="p-4 flex items-center gap-3 border-b border-victory-border">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-victory-card border border-victory-border flex items-center justify-center touch-target">
          <ArrowLeft className="w-5 h-5 text-victory-text" />
        </button>
        <h1 className="text-lg font-heading font-bold text-victory-text">
          {isCompete ? t("createPost.titleCompete") : t("createPost.title")}
        </h1>
      </header>

      <main className="px-4 py-4 space-y-5">
        {/* Post type selector (only for regular posts) */}
        {!isCompeteMode && (
          <div>
            <p className="text-victory-muted text-sm mb-2">{t("createPost.postType")}</p>
            <div className="flex gap-2">
              {POST_TYPES.map(({ key, icon: Icon, labelKey }) => (
                <button
                  key={key}
                  onClick={() => setPostType(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors flex-1 justify-center ${
                    postType === key ? "bg-victory-lime text-victory-bg" : "bg-victory-card border border-victory-border text-victory-muted"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Video upload */}
        <div>
          <p className="text-victory-muted text-sm mb-2">{t("createPost.video")}{isCompete && " *"}</p>
          {videoPreview ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video src={videoPreview} controls className="w-full h-full object-contain" />
              <button
                onClick={() => { setVideoFile(null); setVideoPreview(null); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-victory-border flex flex-col items-center justify-center gap-3 text-victory-muted hover:border-victory-lime/50 hover:text-victory-lime transition-colors"
            >
              <Video className="w-10 h-10" />
              <p className="text-sm">{t("createPost.tapToUpload")}</p>
              <p className="text-xs">{t("createPost.videoFormats")}</p>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
        </div>

        {/* Competition fields */}
        {isCompete && (
          <>
            <div>
              <label className="victory-label">{t("createPost.compTitle")} *</label>
              <input
                value={compTitle}
                onChange={(e) => setCompTitle(e.target.value)}
                className="victory-input"
                placeholder={t("createPost.compTitlePlaceholder")}
                maxLength={80}
              />
            </div>
            <div>
              <label className="victory-label">{t("createPost.compDesc")}</label>
              <textarea
                value={compDesc}
                onChange={(e) => setCompDesc(e.target.value)}
                className="victory-input resize-none"
                rows={2}
                placeholder={t("createPost.compDescPlaceholder")}
                maxLength={200}
              />
            </div>
            <div>
              <label className="victory-label">{t("createPost.judgeType")}</label>
              <div className="flex gap-2">
                {[
                  { key: "poll", label: t("createPost.judgePoll") },
                  { key: "ai_judge", label: t("createPost.judgeAI") },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setCompType(key)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                      compType === key ? "bg-victory-lime text-victory-bg" : "bg-victory-card border border-victory-border text-victory-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {compType === "ai_judge" && (
                <p className="text-victory-muted text-xs mt-1.5">{t("createPost.aiJudgeNote")}</p>
              )}
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="victory-label">{t("createPost.votingDuration")}</label>
                <span className="text-victory-lime font-mono">{duration}h</span>
              </div>
              <input
                type="range" min={6} max={168} step={6}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full h-2"
              />
            </div>
          </>
        )}

        {/* Caption (regular posts) */}
        {!isCompete && (
          <div>
            <label className="victory-label">{t("createPost.caption")}</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="victory-input resize-none"
              rows={3}
              placeholder={t("createPost.captionPlaceholder")}
              maxLength={500}
            />
          </div>
        )}

        {/* Tags */}
        {!isCompete && (
          <div>
            <p className="text-victory-muted text-sm mb-2">{t("createPost.tags")}</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    tags.includes(tag)
                      ? "bg-victory-lime text-victory-bg"
                      : "bg-victory-card border border-victory-border text-victory-muted"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Sticky Post button — always visible above BottomNav */}
      <div className="fixed bottom-20 left-0 right-0 px-4 py-3 bg-victory-bg/95 backdrop-blur-sm border-t border-victory-border z-40">
        {uploading && uploadProgress > 0 && (
          <div className="mb-2 space-y-1">
            <div className="flex justify-between text-xs text-victory-muted">
              <span>{t("createPost.uploading")}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 bg-victory-border rounded-full overflow-hidden">
              <div className="h-full bg-victory-lime rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={uploading || !canSubmit}
          className="w-full victory-btn-primary py-4 text-base font-bold disabled:opacity-40"
        >
          {uploading
            ? `${t("createPost.uploading")} ${uploadProgress}%`
            : isCompete
            ? t("createPost.post")
            : t("createPost.post")}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
