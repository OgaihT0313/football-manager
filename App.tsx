import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { BigShouldersDisplay_700Bold, BigShouldersDisplay_800ExtraBold, BigShouldersDisplay_900Black } from '@expo-google-fonts/big-shoulders-display';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from './components/BottomNav';
import { PALETTES, THEME_VARS, useScheme, useWide } from './components/theme';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { ClubScreen } from './screens/ClubScreen';
import { ClubSelectScreen } from './screens/ClubSelectScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LeagueScreen } from './screens/LeagueScreen';
import { LineupScreen } from './screens/LineupScreen';
import { MarketScreen } from './screens/MarketScreen';
import { MatchDetailScreen } from './screens/MatchDetailScreen';
import { MenuScreen } from './screens/MenuScreen';
import { SquadScreen } from './screens/SquadScreen';
import { useGame } from './store/gameStore';

function NoClub() {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <Text className="text-center font-sans text-base text-mute">Você está sem clube. Procure uma vaga no Início.</Text>
    </View>
  );
}

function GameTabs() {
  const tab = useGame((s) => s.tab);
  const matchDetailId = useGame((s) => s.matchDetailId);
  const employed = useGame((s) => s.career?.manager.employed ?? true);
  const wide = useWide();
  return (
    <View className="flex-1">
      {wide ? <TopBar /> : null}
      <View className="flex-1">
        {tab === 'inicio' && <HomeScreen />}
        {!employed && (tab === 'elenco' || tab === 'escalacao' || tab === 'mercado' || tab === 'clube') && <NoClub />}
        {employed && tab === 'elenco' && <SquadScreen />}
        {employed && tab === 'escalacao' && <LineupScreen />}
        {employed && tab === 'mercado' && <MarketScreen />}
        {employed && tab === 'clube' && <ClubScreen />}
        {tab === 'liga' && <LeagueScreen />}
      </View>
      <Toast />
      {wide ? null : <BottomNav />}
      {matchDetailId && <MatchDetailScreen fixtureId={matchDetailId} />}
    </View>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);
  const init = useGame((s) => s.init);
  const themePref = useGame((s) => s.themePref);
  const { setColorScheme } = useColorScheme();
  const scheme = useScheme();
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    BigShouldersDisplay_700Bold,
    BigShouldersDisplay_800ExtraBold,
    BigShouldersDisplay_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    setColorScheme(themePref);
  }, [themePref, setColorScheme]);

  // Sem as fontes, segue com as do sistema (melhor que travar a abertura).
  const ready = fontsLoaded || !!fontError;

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* As variáveis do tema valem para tudo abaixo (classes bg-bg, text-ink, ...). */}
      <View style={[THEME_VARS[scheme], { flex: 1, backgroundColor: PALETTES[scheme].bg }]}>
        <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-bg">
          {phase === 'carregando' || !ready ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={PALETTES[scheme].acc} />
            </View>
          ) : null}
          {ready && phase === 'menu' && <MenuScreen />}
          {ready && phase === 'escolhaClube' && <ClubSelectScreen />}
          {ready && phase === 'jogo' && <GameTabs />}
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}
