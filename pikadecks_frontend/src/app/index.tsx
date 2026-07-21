import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Animated,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { pikaAssets } from '@/constants/assets';

type ScreenData = {
  mascot: any;
  eyebrow: string;
  headline: string;
  subtext: string;
  chips: { iconFamily: 'Feather' | 'FontAwesome5'; iconName: string; label: string }[];
};

const screens: ScreenData[] = [
  {
    mascot: pikaAssets.hiThere,
    eyebrow: 'Welcome',
    headline: 'Turn Anything Into Flashcards',
    subtext: 'Upload PDFs, YouTube videos, notes, or screenshots and instantly create smart study decks.',
    chips: [
      { iconFamily: 'Feather', iconName: 'file-text', label: 'PDFs' },
      { iconFamily: 'Feather', iconName: 'youtube', label: 'YouTube' },
      { iconFamily: 'FontAwesome5', iconName: 'sticky-note', label: 'Notes' },
      { iconFamily: 'Feather', iconName: 'image', label: 'Screenshots' },
    ],
  },
  {
    mascot: pikaAssets.superPika, // Replacement for AI mascot
    eyebrow: 'AI Magic',
    headline: 'AI Builds Your Learning System',
    subtext: 'Get summaries, quizzes, spaced repetition, and personalized questions automatically.',
    chips: [
      { iconFamily: 'FontAwesome5', iconName: 'magic', label: 'Extracting concepts' },
      { iconFamily: 'FontAwesome5', iconName: 'brain', label: 'Generating cards' },
      { iconFamily: 'Feather', iconName: 'zap', label: 'Creating quizzes' },
    ],
  },
  {
    mascot: pikaAssets.achievement,
    eyebrow: 'Results',
    headline: 'Remember More. Study Less.',
    subtext: 'Learn faster with daily review sessions, streaks, and smart memory training.',
    chips: [
      { iconFamily: 'Feather', iconName: 'repeat', label: 'Daily review' },
      { iconFamily: 'FontAwesome5', iconName: 'fire', label: 'Streaks' },
      { iconFamily: 'FontAwesome5', iconName: 'brain', label: 'Memory training' },
    ],
  },
];

export default function Onboarding() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const s = screens[currentIndex];
  const isLast = currentIndex === screens.length - 1;

  // Animations
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -15,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim]);

  const handleNext = () => {
    if (isLast) {
      router.push('/auth');
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const renderIcon = (chip: ScreenData['chips'][0]) => {
    if (chip.iconFamily === 'Feather') {
      return <Feather name={chip.iconName as any} size={14} color="#000" />;
    }
    return <FontAwesome5 name={chip.iconName as any} size={14} color="#000" />;
  };

  return (
    <View style={styles.container}>
      {/* Background blobs (static representations) */}
      <View style={styles.topBlob} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image source={pikaAssets.appIcon} style={styles.logo} resizeMode="contain" />
          <Text style={styles.logoText}>PikaDecks</Text>
        </View>
        {!isLast && (
          <TouchableOpacity onPress={() => router.push('/auth')}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Mascot Area */}
      <View style={styles.mascotArea}>
        <Animated.View style={[styles.mascotContainer, { transform: [{ translateY: floatAnim }] }]}>
          <Image source={s.mascot} style={styles.mascotImage} resizeMode="contain" />
        </Animated.View>
        {/* Shadow under mascot */}
        <View style={styles.mascotShadow} />
      </View>

      {/* Content */}
      <View style={styles.contentArea}>
        <Text style={styles.eyebrow}>{s.eyebrow}</Text>
        <Text style={styles.headline}>{s.headline}</Text>
        <Text style={styles.subtext}>{s.subtext}</Text>

        {/* Chips */}
        <View style={styles.chipsContainer}>
          {s.chips.map((chip, idx) => (
            <View key={idx} style={styles.chip}>
              {renderIcon(chip)}
              <Text style={styles.chipText}>{chip.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Footer Controls */}
      <View style={styles.footer}>
        <View style={styles.dotsContainer}>
          {screens.map((_, idx) => (
            <TouchableOpacity key={idx} onPress={() => setCurrentIndex(idx)}>
              <View style={[styles.dot, idx === currentIndex ? styles.activeDot : {}]} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {isLast ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
        
        {/* Demo Button for the 3rd screen (as per Lovable reference, removed Upload Content) */}
        {isLast && (
          <TouchableOpacity 
            style={styles.secondaryButton} 
            activeOpacity={0.8}
          >
            <Feather name="play-circle" size={16} color="#451a03" style={{ marginRight: 6 }} />
            <Text style={styles.secondaryButtonText}>Try Demo</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf2',
  },
  topBlob: {
    position: 'absolute',
    top: -100,
    right: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(253, 224, 71, 0.4)', // yellow-200/40
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    zIndex: 10,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 18,
  },
  logoText: {
    marginLeft: 8,
    fontWeight: '900',
    fontSize: 16,
    color: '#000',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#78716c',
  },
  mascotArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
  },
  mascotContainer: {
    zIndex: 2,
  },
  mascotImage: {
    width: 200,
    height: 200,
  },
  mascotShadow: {
    position: 'absolute',
    bottom: 60,
    width: 120,
    height: 12,
    borderRadius: 50,
    backgroundColor: 'rgba(120, 53, 15, 0.1)',
  },
  contentArea: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#d97706', // amber-600
    marginBottom: 8,
  },
  headline: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
    color: '#000',
  },
  subtext: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: '#57534e', // stone-600
    marginTop: 12,
    marginBottom: 20,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(253,230,138,0.5)',
    margin: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
    color: '#000',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fde68a', // amber-200
    marginHorizontal: 4,
  },
  activeDot: {
    width: 32,
    backgroundColor: '#f59e0b', // amber-500
  },
  primaryButton: {
    backgroundColor: '#fbbf24', // amber-400
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 0,
    elevation: 3,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#451a03', // amber-950
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.7)',
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fde68a',
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#451a03',
  },
});
