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

export default function App() {
  // First-visit intro, once per page load: the logo splash, then the
  // kangaroo's tour of the street the first time the street is on screen.
  const [intro, setIntro] = useState("splash"); // splash -> tour -> done
  const startTour = useCallback(() => setIntro((i) => (i === "splash" ? "tour" : i)), []);
  const endTour = useCallback(() => setIntro("done"), []);

  // The radio popup, app-wide so the music and the mini radio carry on
  // across pages (see RadioLayer).
  const [radioOpen, setRadioOpen] = useState(false);
  const openRadio = useCallback(() => setRadioOpen(true), []);
  const closeRadio = useCallback(() => setRadioOpen(false), []);

  // The community bookshelf popup, opened from the street's 📖 window.
  const [shelfOpen, setShelfOpen] = useState(false);
  const openShelf = useCallback(() => setShelfOpen(true), []);
  const closeShelf = useCallback(() => setShelfOpen(false), []);

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
              onOpenRadio={openRadio}
              onOpenBookshelf={openShelf}
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
    </BrowserRouter>
  );
}
