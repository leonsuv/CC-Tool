import React from 'react';
import { Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { usePalette } from './StudioUI';
import { tr } from '../i18n';

export function TimelapsePlayer({ uri }: { uri: string }) {
  const c = usePalette();
  const player = useVideoPlayer(uri, instance => {
    instance.loop = false;
  });
  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  return (
    <View style={{ gap: 12 }}>
      <VideoView
        player={player}
        style={{
          width: '100%',
          aspectRatio: 16 / 9,
          borderRadius: 18,
          backgroundColor: '#08110E',
        }}
        nativeControls
        allowsFullscreen
        allowsPictureInPicture={false}
      />
      {status === 'loading' && (
        <Text style={{ color: c.muted }}>{tr('Video wird geladen …')}</Text>
      )}
      {error && (
        <Text style={{ color: c.danger }}>
          {tr(
            'Video kann nicht abgespielt werden. Versuche es über „Herunterladen“.'
          )}{' '}
          {error.message}
        </Text>
      )}
    </View>
  );
}
