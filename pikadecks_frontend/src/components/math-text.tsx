import React from 'react';
import { View, StyleSheet, TextStyle, StyleProp, ViewStyle, Image, TouchableOpacity } from 'react-native';
import { MathJaxSvg } from 'react-native-mathjax-html-to-svg';
import { parseMarkdownBlocks } from '../lib/parse-markdown';

interface MathTextProps {
  text: string;
  color?: string;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onImagePress?: (url: string) => void;
}

export const MathText: React.FC<MathTextProps> = ({ text, color = '#FFFFFF', fontSize = 16, style, textStyle, onImagePress }) => {
  if (!text) return null;

  const blocks = parseMarkdownBlocks(text);

  return (
    <View style={[styles.container, style]}>
      {blocks.map((block, idx) => {
        if (block.type === 'text') {
          return (
            <View key={idx} style={{ width: '100%' }} pointerEvents="none">
              <MathJaxSvg
                fontSize={fontSize}
                color={color}
                fontCache={true}
                style={StyleSheet.flatten(style)}
                textStyle={StyleSheet.flatten(textStyle)}
              >
                {block.content}
              </MathJaxSvg>
            </View>
          );
        } else if (block.type === 'image') {
          return (
            <TouchableOpacity 
              key={idx} 
              activeOpacity={0.9} 
              onPress={() => onImagePress?.(block.src)}
              style={styles.imageContainer}
              disabled={!onImagePress}
            >
              <Image 
                source={{ uri: block.src }} 
                style={styles.image} 
                resizeMode="cover" 
              />
            </TouchableOpacity>
          );
        }
        return null;
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    marginVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.02)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    aspectRatio: 16/9,
  },
  image: {
    width: '100%',
    height: '100%',
  }
});
