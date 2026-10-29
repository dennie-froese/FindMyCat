import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { ratingService, RatingTriggerReason } from '../services/ratingService';

export interface RateAppModalProps {
  visible: boolean;
  onClose: () => void;
  triggerReason?: RatingTriggerReason;
  petName?: string;
}

export const RateAppModal: React.FC<RateAppModalProps> = ({
  visible,
  onClose,
  triggerReason = 'manual',
  petName,
}) => {
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('General');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [completionMessage, setCompletionMessage] = useState<string>('');

  useEffect(() => {
    if (visible && triggerReason !== 'manual') {
      ratingService.markPromptShown().catch(() => {});
    }
  }, [visible, triggerReason]);

  const resetState = () => {
    setSelectedRating(5);
    setFeedbackText('');
    setSelectedTag('General');
    setIsSubmitting(false);
    setIsCompleted(false);
    setCompletionMessage('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleRemindLater = async () => {
    await ratingService.postponePrompt();
    handleClose();
  };

  const handleNeverAskAgain = async () => {
    await ratingService.dismissNeverAskAgain();
    handleClose();
  };

  const handleRateStore = async () => {
    setIsSubmitting(true);
    try {
      await ratingService.requestStoreReview();
      setCompletionMessage('Thank you so much! Your review helps bring more lost pets home safely. ❤️');
      setIsCompleted(true);
      setTimeout(() => {
        handleClose();
      }, 2200);
    } catch {
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) {
      handleClose();
      return;
    }
    setIsSubmitting(true);
    try {
      await ratingService.submitFeedback(selectedRating, feedbackText, selectedTag);
      setCompletionMessage('Thank you for sharing your thoughts! We read every note to improve Find My Cat. 🐾');
      setIsCompleted(true);
      setTimeout(() => {
        handleClose();
      }, 2200);
    } catch {
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const getHeadline = () => {
    if (triggerReason === 'reunited' && petName) {
      return `So glad ${petName} is home! 🎉`;
    }
    if (triggerReason === 'reunited') {
      return 'Safely Reunited! 🎉';
    }
    if (triggerReason === 'sighting_reported') {
      return 'Thank You, Lookout! 🐾';
    }
    if (triggerReason === 'poster_generated') {
      return 'Lost Poster Created! 🖨️';
    }
    return 'Loving Find My Cat? ⭐';
  };

  const getSubtitle = () => {
    if (triggerReason === 'reunited') {
      return 'Would you take 10 seconds to rate the app? Every rating alerts more local neighbours when cats wander.';
    }
    if (triggerReason === 'sighting_reported') {
      return 'Your anonymous sighting just helped protect community felines. How has your experience been so far?';
    }
    if (triggerReason === 'poster_generated') {
      return 'High-contrast posters work best when more pet lovers are on the radar. How do you rate Find My Cat?';
    }
    return 'Your rating and feedback help us build the fastest, safest neighbourhood lost pet radar.';
  };

  const getRatingLabel = () => {
    switch (selectedRating) {
      case 1:
        return 'Needs a lot of work 😿';
      case 2:
        return 'Could be better 🐱';
      case 3:
        return "It's okay 🐾";
      case 4:
        return 'Really good! 😸';
      case 5:
      default:
        return 'Loving it! 😻';
    }
  };

  const feedbackTags = ['Map & Radar', 'Camera & Photos', 'Alerts & Speed', 'Other'];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardContainer}
          >
            <View style={styles.card}>
              {/* Dismiss Button */}
              <TouchableOpacity
                style={styles.closeIconBtn}
                onPress={handleClose}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Completion State */}
              {isCompleted ? (
                <View style={styles.completionContainer}>
                  <View style={styles.completionBadge}>
                    <Text style={styles.completionEmoji}>😻</Text>
                  </View>
                  <Text style={styles.completionTitle}>You're Pawsome!</Text>
                  <Text style={styles.completionSubtitle}>{completionMessage}</Text>
                </View>
              ) : (
                <>
                  {/* Header Badge */}
                  <View style={styles.headerBadge}>
                    <Ionicons name="star" size={26} color="#ffffff" />
                  </View>

                  <Text style={styles.title}>{getHeadline()}</Text>
                  <Text style={styles.subtitle}>{getSubtitle()}</Text>

                  {/* Star Rating Row */}
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => setSelectedRating(star)}
                        activeOpacity={0.7}
                        style={styles.starTouchArea}
                      >
                        <Ionicons
                          name={star <= selectedRating ? 'star' : 'star-outline'}
                          size={36}
                          color={star <= selectedRating ? '#f59e0b' : '#cbd5e1'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.ratingLabelText}>{getRatingLabel()}</Text>

                  {/* High Satisfaction: 4-5 Stars -> App Store Direct */}
                  {selectedRating >= 4 ? (
                    <View style={styles.actionGroup}>
                      <TouchableOpacity
                        style={styles.primaryBtn}
                        onPress={handleRateStore}
                        disabled={isSubmitting}
                        activeOpacity={0.85}
                      >
                        {isSubmitting ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <>
                            <Ionicons name="sparkles" size={18} color="#ffffff" />
                            <Text style={styles.primaryBtnText}>Rate on the App Store</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <View style={styles.secondaryActionsRow}>
                        <TouchableOpacity onPress={handleRemindLater} activeOpacity={0.7}>
                          <Text style={styles.secondaryLink}>Remind me later</Text>
                        </TouchableOpacity>
                        <Text style={styles.dotSeparator}>•</Text>
                        <TouchableOpacity onPress={handleNeverAskAgain} activeOpacity={0.7}>
                          <Text style={styles.secondaryLink}>Don't ask again</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* Constructive Feedback: 1-3 Stars -> Private Support Input */
                    <View style={styles.feedbackSection}>
                      <Text style={styles.feedbackSectionTitle}>
                        How can we improve Find My Cat for you?
                      </Text>

                      {/* Tag Pill Selector */}
                      <View style={styles.tagsContainer}>
                        {feedbackTags.map((tag) => {
                          const isSelected = selectedTag === tag;
                          return (
                            <TouchableOpacity
                              key={tag}
                              style={[styles.tagPill, isSelected && styles.tagPillActive]}
                              onPress={() => setSelectedTag(tag)}
                            >
                              <Text
                                style={[styles.tagPillText, isSelected && styles.tagPillTextActive]}
                              >
                                {tag}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Text Input */}
                      <TextInput
                        style={styles.feedbackInput}
                        placeholder="Tell us what went wrong or how we can do better..."
                        placeholderTextColor="#94a3b8"
                        multiline
                        numberOfLines={3}
                        value={feedbackText}
                        onChangeText={setFeedbackText}
                      />

                      <TouchableOpacity
                        style={styles.submitFeedbackBtn}
                        onPress={handleSubmitFeedback}
                        disabled={isSubmitting}
                        activeOpacity={0.85}
                      >
                        {isSubmitting ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.submitFeedbackBtnText}>Send Helpful Feedback</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleClose}
                        style={{ marginTop: 8 }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.secondaryLink}>Skip for now</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  keyboardContainer: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    position: 'relative',
  },
  closeIconBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  starTouchArea: {
    padding: 4,
  },
  ratingLabelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d97706',
    marginBottom: 18,
  },
  actionGroup: {
    width: '100%',
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 10,
  },
  secondaryLink: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  dotSeparator: {
    fontSize: 12,
    color: Colors.border,
  },
  feedbackSection: {
    width: '100%',
    alignItems: 'center',
  },
  feedbackSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 12,
  },
  tagPill: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tagPillActive: {
    backgroundColor: '#ffedd5',
    borderColor: '#fdba74',
  },
  tagPillText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  tagPillTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  feedbackInput: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontSize: 13,
    color: Colors.textPrimary,
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 12,
  },
  submitFeedbackBtn: {
    width: '100%',
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitFeedbackBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  completionContainer: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  completionBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  completionEmoji: {
    fontSize: 34,
  },
  completionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#065f46',
    marginBottom: 8,
  },
  completionSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
});
