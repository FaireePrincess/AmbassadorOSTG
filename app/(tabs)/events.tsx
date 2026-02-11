import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Clock, MapPin, Users, Globe, Check, ExternalLink, Plus, Trash2, Edit3, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import PressableScale from '@/components/PressableScale';
import EmptyState from '@/components/EmptyState';
import { EventType, Event } from '@/types';

type FilterType = 'all' | EventType;

const EVENT_IMAGE_PRESETS = [
  'https://images.unsplash.com/photo-1515169067868-5387ec356754?w=800&h=500&fit=crop',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&h=500&fit=crop',
  'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&h=500&fit=crop',
  'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=800&h=500&fit=crop',
];

export default function EventsScreen() {
  const { isAdmin } = useAuth();
  const { events, rsvpStates, updateRsvp, isRefreshing, refreshData, addEvent, updateEvent, deleteEvent } = useApp();
  const [activeFilter] = useState<FilterType>('all');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'online' as EventType,
    thumbnail: '',
    date: '',
    time: '',
    location: '',
    timezone: 'UTC',
    maxAttendees: '',
    link: '',
  });

  

  const filteredEvents = useMemo(() => {
    return activeFilter === 'all' 
      ? events 
      : events.filter(e => e.type === activeFilter);
  }, [events, activeFilter]);

  const handleRefresh = useCallback(() => {
    refreshData();
  }, [refreshData]);

  const handleRSVP = useCallback((eventId: string, eventTitle: string) => {
    const isCurrentlyRsvped = rsvpStates[eventId];
    
    if (isCurrentlyRsvped) {
      Alert.alert(
        'Cancel RSVP',
        `Are you sure you want to cancel your RSVP for "${eventTitle}"?`,
        [
          { text: 'Keep RSVP', style: 'cancel' },
          { 
            text: 'Cancel RSVP', 
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              updateRsvp(eventId, false);
            }
          },
        ]
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      updateRsvp(eventId, true);
      Alert.alert(
        'RSVP Confirmed! 🎉',
        `You are registered for "${eventTitle}". We'll send you a reminder before the event.`,
        [{ text: 'Great!' }]
      );
    }
  }, [rsvpStates, updateRsvp]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getTimeUntil = (dateStr: string) => {
    const eventDate = new Date(dateStr);
    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Past';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays} days`;
    if (diffDays < 30) return `In ${Math.ceil(diffDays / 7)} weeks`;
    return `In ${Math.ceil(diffDays / 30)} months`;
  };

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      description: '',
      type: 'online',
      thumbnail: '',
      date: '',
      time: '',
      location: '',
      timezone: 'UTC',
      maxAttendees: '',
      link: '',
    });
    setEditingEvent(null);
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setIsModalVisible(true);
  }, [resetForm]);

  const openEditModal = useCallback((event: Event) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description,
      type: event.type,
      thumbnail: event.thumbnail,
      date: event.date,
      time: event.time,
      location: event.location,
      timezone: event.timezone,
      maxAttendees: event.maxAttendees?.toString() || '',
      link: event.link || '',
    });
    setIsModalVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.title.trim() || !formData.description.trim() || !formData.date || !formData.time) {
      Alert.alert('Error', 'Please fill in title, description, date, and time');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const eventData = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      type: formData.type,
      thumbnail: formData.thumbnail.trim() || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop',
      date: formData.date,
      time: formData.time,
      location: formData.location.trim() || (formData.type === 'online' ? 'Online' : 'TBD'),
      timezone: formData.timezone || 'UTC',
      maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
      link: formData.link.trim() || undefined,
    };

    let result;
    if (editingEvent) {
      result = await updateEvent(editingEvent.id, eventData);
    } else {
      result = await addEvent(eventData);
    }

    setIsSubmitting(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsModalVisible(false);
      resetForm();
      Alert.alert('Success', editingEvent ? 'Event updated' : 'Event created');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to save event');
    }
  }, [formData, editingEvent, addEvent, updateEvent, resetForm]);

  const handleDelete = useCallback((event: Event) => {
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${event.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const result = await deleteEvent(event.id);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', result.error || 'Failed to delete event');
            }
          },
        },
      ]
    );
  }, [deleteEvent]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Events</Text>
            <Text style={styles.subtitle}>{filteredEvents.length} upcoming events</Text>
          </View>
          {isAdmin && (
            <PressableScale style={styles.addBtn} onPress={openAddModal} hapticType="medium">
              <Plus size={20} color="#FFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </PressableScale>
          )}
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
      >
        {filteredEvents.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No events found"
            message="There are no upcoming events at this time."
          />
        ) : (
          <View style={styles.eventsContainer}>
            {filteredEvents.map((event) => {
              const isRsvped = rsvpStates[event.id];
              const timeUntil = getTimeUntil(event.date);
              const isPast = timeUntil === 'Past';
              
              return (
                <View key={event.id} style={[styles.eventCard, isPast && styles.eventCardPast]}>
                  <Image source={event.thumbnail} style={styles.eventImage} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  
                  <View style={styles.eventOverlay}>
                    <View style={styles.eventBadges}>
                      <View style={[styles.typeBadge, event.type === 'irl' ? styles.irlBadge : styles.onlineBadge]}>
                        {event.type === 'irl' ? (
                          <MapPin size={12} color="#FFF" />
                        ) : (
                          <Globe size={12} color="#FFF" />
                        )}
                        <Text style={styles.typeBadgeText}>
                          {event.type === 'irl' ? 'In-Person' : 'Online'}
                        </Text>
                      </View>
                      
                      {!isPast && (
                        <View style={styles.timeBadge}>
                          <Text style={styles.timeBadgeText}>{timeUntil}</Text>
                        </View>
                      )}
                    </View>

                    {isAdmin && (
                      <View style={styles.adminOverlay}>
                        <PressableScale
                          style={styles.adminIconBtn}
                          onPress={() => openEditModal(event)}
                          hapticType="light"
                        >
                          <Edit3 size={14} color="#FFF" />
                        </PressableScale>
                        <PressableScale
                          style={[styles.adminIconBtn, styles.deleteBtn]}
                          onPress={() => handleDelete(event)}
                          hapticType="light"
                        >
                          <Trash2 size={14} color="#FFF" />
                        </PressableScale>
                      </View>
                    )}
                  </View>

                  <View style={styles.eventContent}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventDescription} numberOfLines={2}>{event.description}</Text>

                    <View style={styles.eventDetails}>
                      <View style={styles.detailRow}>
                        <Calendar size={14} color={Colors.dark.textMuted} />
                        <Text style={styles.detailText}>{formatDate(event.date)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Clock size={14} color={Colors.dark.textMuted} />
                        <Text style={styles.detailText}>{event.time} {event.timezone}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <MapPin size={14} color={Colors.dark.textMuted} />
                        <Text style={styles.detailText} numberOfLines={1}>{event.location}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Users size={14} color={Colors.dark.textMuted} />
                        <Text style={styles.detailText}>
                          {event.attendees} attending
                          {event.maxAttendees && ` / ${event.maxAttendees} spots`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.eventActions}>
                      {!isPast && (
                        <PressableScale 
                          style={[styles.rsvpBtn, isRsvped && styles.rsvpBtnActive]}
                          onPress={() => handleRSVP(event.id, event.title)}
                          hapticType="medium"
                          testID={`rsvp-${event.id}`}
                        >
                          {isRsvped ? (
                            <>
                              <Check size={16} color={Colors.dark.success} />
                              <Text style={[styles.rsvpText, styles.rsvpTextActive]}>Going</Text>
                            </>
                          ) : (
                            <Text style={styles.rsvpText}>RSVP Now</Text>
                          )}
                        </PressableScale>
                      )}
                      
                      {event.link && (
                        <PressableScale style={styles.linkBtn} testID={`link-${event.id}`}>
                          <ExternalLink size={14} color={Colors.dark.primary} />
                          <Text style={styles.linkText}>Event Link</Text>
                        </PressableScale>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>{editingEvent ? 'Edit Event' : 'New Event'}</Text>
            <PressableScale onPress={handleSave} disabled={isSubmitting}>
              <Check size={24} color={isSubmitting ? Colors.dark.textMuted : Colors.dark.primary} />
            </PressableScale>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={formData.title}
                onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
                placeholder="Event title"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                placeholder="Event description"
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Type *</Text>
              <View style={styles.typeRow}>
                <PressableScale
                  style={[styles.typeOption, formData.type === 'online' && styles.typeOptionActive]}
                  onPress={() => setFormData(prev => ({ ...prev, type: 'online' }))}
                  hapticType="selection"
                >
                  <Globe size={18} color={formData.type === 'online' ? Colors.dark.primary : Colors.dark.textMuted} />
                  <Text style={[styles.typeOptionText, formData.type === 'online' && styles.typeOptionTextActive]}>Online</Text>
                </PressableScale>
                <PressableScale
                  style={[styles.typeOption, formData.type === 'irl' && styles.typeOptionActive]}
                  onPress={() => setFormData(prev => ({ ...prev, type: 'irl' }))}
                  hapticType="selection"
                >
                  <MapPin size={18} color={formData.type === 'irl' ? Colors.dark.primary : Colors.dark.textMuted} />
                  <Text style={[styles.typeOptionText, formData.type === 'irl' && styles.typeOptionTextActive]}>In-Person</Text>
                </PressableScale>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Date *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.date}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, date: text }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.inputLabel}>Time *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.time}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, time: text }))}
                  placeholder="14:00"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Timezone</Text>
                <TextInput
                  style={styles.input}
                  value={formData.timezone}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, timezone: text }))}
                  placeholder="UTC"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.inputLabel}>Max Attendees</Text>
                <TextInput
                  style={styles.input}
                  value={formData.maxAttendees}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, maxAttendees: text }))}
                  placeholder="100"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={styles.input}
                value={formData.location}
                onChangeText={(text) => setFormData(prev => ({ ...prev, location: text }))}
                placeholder={formData.type === 'online' ? 'Discord, Zoom, etc.' : 'Address or venue'}
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Event Link</Text>
              <TextInput
                style={styles.input}
                value={formData.link}
                onChangeText={(text) => setFormData(prev => ({ ...prev, link: text }))}
                placeholder="https://..."
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Event Image</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imagePresetRow}>
                {EVENT_IMAGE_PRESETS.map((imageUrl) => {
                  const isSelected = formData.thumbnail === imageUrl;
                  return (
                    <PressableScale
                      key={imageUrl}
                      onPress={() => setFormData(prev => ({ ...prev, thumbnail: imageUrl }))}
                      style={[styles.imagePresetCard, isSelected && styles.imagePresetCardActive]}
                    >
                      <Image source={imageUrl} style={styles.imagePreset} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalBottomPadding} />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    padding: 20,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  filterScroll: {
    maxHeight: 50,
    marginBottom: 8,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  filterTextActive: {
    color: Colors.dark.text,
  },
  eventsContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  eventCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 20,
  },
  eventCardPast: {
    opacity: 0.6,
  },
  eventImage: {
    width: '100%',
    height: 140,
  },
  eventOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventBadges: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  adminOverlay: {
    flexDirection: 'row',
    gap: 6,
  },
  adminIconBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
  },
  deleteBtn: {
    backgroundColor: Colors.dark.error + 'CC',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  irlBadge: {
    backgroundColor: Colors.dark.accent,
  },
  onlineBadge: {
    backgroundColor: Colors.dark.secondary,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  timeBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  eventContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  eventDetails: {
    gap: 10,
    marginBottom: 18,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  eventActions: {
    flexDirection: 'row',
    gap: 12,
  },
  rsvpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.dark.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minHeight: 48,
  },
  rsvpBtnActive: {
    backgroundColor: Colors.dark.success + '20',
    borderWidth: 1,
    borderColor: Colors.dark.success,
  },
  rsvpText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  rsvpTextActive: {
    color: Colors.dark.success,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary + '20',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  bottomPadding: {
    height: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  typeOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.dark.textMuted,
  },
  typeOptionTextActive: {
    color: Colors.dark.primary,
  },
  modalBottomPadding: {
    height: 40,
  },
  imagePresetRow: {
    gap: 10,
  },
  imagePresetCard: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagePresetCardActive: {
    borderColor: Colors.dark.primary,
  },
  imagePreset: {
    width: 150,
    height: 90,
  },
});
    if (formData.thumbnail.startsWith('data:')) {
      Alert.alert('Image Too Large', 'Please use one of the preset event images for now.');
      return;
    }
