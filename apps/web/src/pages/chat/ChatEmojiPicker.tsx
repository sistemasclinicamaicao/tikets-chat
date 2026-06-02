import EmojiPicker, {
  SuggestionMode,
  Theme,
  type EmojiClickData,
} from 'emoji-picker-react';
import esEmojiData from 'emoji-picker-react/dist/data/emojis-es';

type ChatEmojiPickerProps = {
  width: number;
  height: number;
  onEmojiClick: (data: EmojiClickData) => void;
};

export default function ChatEmojiPicker({ width, height, onEmojiClick }: ChatEmojiPickerProps) {
  return (
    <EmojiPicker
      theme={Theme.LIGHT}
      lazyLoadEmojis
      skinTonesDisabled
      autoFocusSearch={false}
      width={width}
      height={height}
      emojiData={esEmojiData}
      suggestedEmojisMode={SuggestionMode.RECENT}
      searchPlaceholder="Buscar"
      previewConfig={{ defaultCaption: '¿Cuál es tu mood?' }}
      onEmojiClick={onEmojiClick}
    />
  );
}
