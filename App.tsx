import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from './components/BottomNav';
import { ClubScreen } from './screens/ClubScreen';
import { ClubSelectScreen } from './screens/ClubSelectScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LeagueScreen } from './screens/LeagueScreen';
import { LineupScreen } from './screens/LineupScreen';
import { MarketScreen } from './screens/MarketScreen';
import { MatchDetailScreen } from './screens/MatchDetailScreen';
import { MenuScreen } from './screens/MenuScreen';
import { SquadScreen } from './screens/SquadScreen';
import { Toast } from './components/Toast';
import { useGame } from './store/gameStore';

function GameTabs() {
  const tab = useGame((s) => s.tab);
  const matchDetailId = useGame((s) => s.matchDetailId);
  return (
    <View className="flex-1">
      <View className="flex-1">
        {tab === 'inicio' && <HomeScreen />}
        {tab === 'elenco' && <SquadScreen />}
        {tab === 'escalacao' && <LineupScreen />}
        {tab === 'mercado' && <MarketScreen />}
        {tab === 'clube' && <ClubScreen />}
        {tab === 'liga' && <LeagueScreen />}
      </View>
      <Toast />
      <BottomNav />
      {matchDetailId && <MatchDetailScreen fixtureId={matchDetailId} />}
    </View>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);
  const init = useGame((s) => s.init);
  const themePref = useGame((s) => s.themePref);
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    setColorScheme(themePref);
  }, [themePref, setColorScheme]);

  return (
    <SafeAreaProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-slate-50 dark:bg-slate-950">
        {phase === 'carregando' && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        )}
        {phase === 'menu' && <MenuScreen />}
        {phase === 'escolhaClube' && <ClubSelectScreen />}
        {phase === 'jogo' && <GameTabs />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
