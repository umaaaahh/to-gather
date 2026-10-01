import { useCallback, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import StreetScene from "./pages/StreetScene";
import DrawZone from "./pages/DrawZone";
import NoticeBoard from "./pages/NoticeBoard";
import CanvasTest from "./pages/CanvasTest";
import Admin from "./pages/Admin";
import SplashScreen from "./components/SplashScreen";
import RadioLayer from "./components/RadioLayer";
import BookshelfLayer from "./components/Bookshelf";
import StreetHistoryLayer from "./components/StreetHistory";
import StreetStatsLayer from "./components/StreetStats";

export default function App() {
  // First-visit intro, once per page load: the logo splash, then the
  // kangaroo's tour of the street the first time the street is on screen.
  const [intro, setIntro] = useState("splash"); // splash -> tour -> done
  const startTour = useCallback(() => setIntro((i) => (i === "splash" ? "tour" : i)), []);
  const endTour = useCallback(() => setIntro("done"), []);
  // The kangaroo by the street sign plays the tour again on tap.
  const replayTour = useCallback(() => setIntro("tour"), []);

  // The radio popup, app-wide so the music and the mini radio carry on
  // across pages (see RadioLayer).
  const [radioOpen, setRadioOpen] = useState(false);
  const openRadio = useCallback(() => setRadioOpen(true), []);
  const closeRadio = useCallback(() => setRadioOpen(false), []);

  // The community bookshelf popup, opened from the street's 📖 window.
  const [shelfOpen, setShelfOpen] = useState(false);
  const openShelf = useCallback(() => setShelfOpen(true), []);
  const closeShelf = useCallback(() => setShelfOpen(false), []);

  // The street's history popup, opened from the Cardigan St sign.
  const [historyOpen, setHistoryOpen] = useState(false);
  const openHistory = useCallback(() => setHistoryOpen(true), []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  // The street stats popup, opened from the neon poster on the shopfront.
  const [statsOpen, setStatsOpen] = useState(false);
  const openStats = useCallback(() => setStatsOpen(true), []);
  const closeStats = useCallback(() => setStatsOpen(false), []);

  return (
    <BrowserRouter>
      <SplashScreen onDone={startTour} />
      <Routes>
        {/* The drawing canvas is a child route so it opens as an overlay on
           top of the (blurred) street instead of replacing it — StreetScene
           renders it through <Outlet>. */}
        <Route
          path="/"
          element={
            <StreetScene
              showTour={intro === "tour"}
              onTourDone={endTour}
              onReplayTour={replayTour}
              onOpenRadio={openRadio}
              onOpenBookshelf={openShelf}
              onOpenStreetSign={openHistory}
              onOpenStreetStats={openStats}
            />
          }
        >
          <Route path="draw/:zoneId" element={<DrawZone />} />
        </Route>
        <Route path="/notices" element={<NoticeBoard />} />
        <Route path="/canvas-test" element={<CanvasTest />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <RadioLayer open={radioOpen} onOpen={openRadio} onClose={closeRadio} />
      <BookshelfLayer open={shelfOpen} onClose={closeShelf} />
      <StreetHistoryLayer open={historyOpen} onClose={closeHistory} />
      <StreetStatsLayer open={statsOpen} onClose={closeStats} />
    </BrowserRouter>
  );
}
