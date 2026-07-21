import React, { useMemo } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import { MathJaxSvg } from 'react-native-mathjax-html-to-svg';

type ContentSegment =
  | { type: 'markdown'; content: string; key: string }
  | { type: 'math'; content: string; display: boolean; key: string };

interface FlashcardContentRendererProps {
  content: string;
  images?: Array<string | null | undefined>;
  color?: string;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onImagePress?: (url: string) => void;
  onImageError?: (url: string) => void;
}

const isEscaped = (value: string, index: number) => {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
};

const findClosingDelimiter = (value: string, start: number, delimiter: '$' | '$$') => {
  const step = delimiter.length;
  for (let i = start; i < value.length; i += 1) {
    if (value.slice(i, i + step) !== delimiter || isEscaped(value, i)) continue;

    if (delimiter === '$') {
      const previous = value[i - 1];
      if (!previous || /\s/.test(previous)) continue;
    }

    return i;
  }
  return -1;
};

const parseContentSegments = (content: string): ContentSegment[] => {
  const segments: ContentSegment[] = [];
  let cursor = 0;
  let segmentIndex = 0;

  const pushMarkdown = (end: number) => {
    if (end <= cursor) return;
    const markdown = content.slice(cursor, end);
    if (markdown.length > 0) {
      segments.push({ type: 'markdown', content: markdown, key: `md-${segmentIndex}` });
      segmentIndex += 1;
    }
  };

  for (let i = 0; i < content.length; i += 1) {
    if (content[i] !== '$' || isEscaped(content, i)) continue;

    if (content[i + 1] === '$') {
      const close = findClosingDelimiter(content, i + 2, '$$');
      if (close === -1) continue;

      pushMarkdown(i);
      segments.push({
        type: 'math',
        content: content.slice(i + 2, close).trim(),
        display: true,
        key: `math-${segmentIndex}`,
      });
      segmentIndex += 1;
      cursor = close + 2;
      i = cursor - 1;
      continue;
    }

    const next = content[i + 1];
    if (!next || /\s/.test(next)) continue;

    const close = findClosingDelimiter(content, i + 1, '$');
    if (close === -1) continue;

    pushMarkdown(i);
    segments.push({
      type: 'math',
      content: content.slice(i + 1, close).trim(),
      display: false,
      key: `math-${segmentIndex}`,
    });
    segmentIndex += 1;
    cursor = close + 1;
    i = cursor - 1;
  }

  pushMarkdown(content.length);
  return segments.length > 0 ? segments : [{ type: 'markdown', content, key: 'md-0' }];
};

export const FlashcardContentRenderer: React.FC<FlashcardContentRendererProps> = ({
  content,
  images = [],
  color = '#FFFFFF',
  fontSize = 16,
  style,
  textStyle,
  onImagePress,
  onImageError,
}) => {
  const segments = useMemo(() => parseContentSegments(content || ''), [content]);
  const flattenedTextStyle = StyleSheet.flatten(textStyle) ?? {};
  const extraImages = useMemo(
    () =>
      images
        .filter((image): image is string => Boolean(image?.trim()))
        .filter((image) => !content?.includes(image)),
    [content, images],
  );

  const renderImage = (url: string, key: string, alt?: string) => (
    <TouchableOpacity
      key={key}
      activeOpacity={0.9}
      onPress={() => onImagePress?.(url)}
      style={localStyles.imageContainer}
      disabled={!onImagePress}
    >
      <Image
        source={{ uri: url }}
        accessibilityLabel={alt}
        style={localStyles.image}
        resizeMode="contain"
        onError={(event) => {
          console.warn('[FlashcardContentRenderer] Image failed to load', {
            url,
            error: event.nativeEvent?.error,
          });
          onImageError?.(url);
        }}
      />
    </TouchableOpacity>
  );

  const rules = useMemo<RenderRules>(
    () => ({
      text: (node, _children, _parent, styles) => (
        <Text key={node.key} pointerEvents="none" style={styles.text}>
          {node.content}
        </Text>
      ),
      image: (node) => renderImage(node.attributes.src, node.key, node.attributes.alt),
    }),
    [onImagePress],
  );

  const markdownStyle = useMemo(
    () => ({
      body: {
        color,
        fontSize,
        lineHeight: Math.round(fontSize * 1.45),
        ...flattenedTextStyle,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 6,
      },
      text: {
        color,
        fontSize,
        lineHeight: Math.round(fontSize * 1.45),
        ...flattenedTextStyle,
      },
      strong: {
        fontWeight: '800' as const,
      },
      em: {
        fontStyle: 'italic' as const,
      },
      s: {
        textDecorationLine: 'line-through' as const,
      },
      heading1: {
        color,
        fontSize: Math.round(fontSize * 1.45),
        lineHeight: Math.round(fontSize * 1.8),
        fontWeight: '800' as const,
        marginTop: 8,
        marginBottom: 6,
      },
      heading2: {
        color,
        fontSize: Math.round(fontSize * 1.3),
        lineHeight: Math.round(fontSize * 1.65),
        fontWeight: '800' as const,
        marginTop: 8,
        marginBottom: 6,
      },
      heading3: {
        color,
        fontSize: Math.round(fontSize * 1.15),
        lineHeight: Math.round(fontSize * 1.5),
        fontWeight: '800' as const,
        marginTop: 6,
        marginBottom: 4,
      },
      bullet_list: {
        marginVertical: 4,
      },
      ordered_list: {
        marginVertical: 4,
      },
      list_item: {
        color,
        marginVertical: 2,
      },
      code_inline: {
        color,
        backgroundColor: 'rgba(91,79,230,0.10)',
        borderRadius: 5,
        paddingHorizontal: 4,
      },
      fence: {
        color,
        backgroundColor: 'rgba(42,36,29,0.06)',
        borderRadius: 10,
        padding: 10,
        marginVertical: 8,
      },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: 'rgba(91,79,230,0.35)',
        paddingLeft: 10,
        marginVertical: 8,
        opacity: 0.9,
      },
      link: {
        color: '#5B4FE6',
        textDecorationLine: 'underline' as const,
      },
      table: {
        borderWidth: 1,
        borderColor: 'rgba(42,36,29,0.14)',
        borderRadius: 8,
        marginVertical: 8,
      },
      th: {
        color,
        fontWeight: '800' as const,
        padding: 8,
      },
      td: {
        color,
        padding: 8,
      },
      hr: {
        backgroundColor: 'rgba(42,36,29,0.14)',
        height: 1,
        marginVertical: 12,
      },
    }),
    [color, flattenedTextStyle, fontSize],
  );

  if (!content && extraImages.length === 0) return null;

  return (
    <View style={[localStyles.container, style]}>
      {segments.map((segment) => {
        if (segment.type === 'math') {
          return (
            <View
              key={segment.key}
              pointerEvents="none"
              style={[
                localStyles.mathSegment,
                segment.display ? localStyles.displayMath : localStyles.inlineMath,
              ]}
            >
              <MathJaxSvg fontSize={fontSize} color={color} fontCache>
                {segment.display ? `$$${segment.content}$$` : `$${segment.content}$`}
              </MathJaxSvg>
            </View>
          );
        }

        return (
          <Markdown key={segment.key} rules={rules} style={markdownStyle}>
            {segment.content}
          </Markdown>
        );
      })}

      {extraImages.map((image, index) => renderImage(image, `extra-image-${index}`))}
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'column',
  },
  mathSegment: {
    width: '100%',
    alignItems: 'center',
  },
  displayMath: {
    marginVertical: 8,
  },
  inlineMath: {
    marginVertical: 2,
  },
  imageContainer: {
    width: '100%',
    marginVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(42,36,29,0.04)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(42,36,29,0.08)',
    aspectRatio: 16 / 9,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
