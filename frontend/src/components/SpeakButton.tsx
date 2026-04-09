import { Button } from "antd";
import { SoundOutlined } from "@ant-design/icons";

interface SpeakButtonProps {
  text: string;
  size?: "small" | "middle" | "large";
}

export default function SpeakButton({ text, size = "small" }: SpeakButtonProps) {
  const handleSpeak = () => {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  };

  return (
    <Button
      type="text"
      size={size}
      icon={<SoundOutlined />}
      onClick={handleSpeak}
      style={{ padding: "0 4px" }}
    />
  );
}
