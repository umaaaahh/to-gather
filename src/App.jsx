import { useCallback, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import StreetScene from "./pages/StreetScene";
import DrawZone from "./pages/DrawZone";
import NoticeBoard from "./pages/NoticeBoard";
import CanvasTest from "./pages/CanvasTest";
import Admin from "./pages/Admin";
import SplashScreen from "./components/SplashScreen";

export default function App() {
  // First-visit intro, once per page load: the logo splash, then the
  // kangaroo's tour of the street the first time the street is on screen.
  const [intro, setIntro] = useState("splash"); // splash -> tour -> done
  const startTour = useCallback(() => setIntro((i) => (i === "splash" ? "tour" : i)), []);
  const endTour = useCallback(() => setIntro("done"), []);

  return (
    <BrowserRouter>
      <SplashScreen onDone={startTour} />
      <Routes>
        <Route
          path="/"
          element={<StreetScene showTour={intro === "tour"} onTourDone={endTour} />}
        />
        <Route path="/draw/:zoneId" element={<DrawZone />} />
        <Route path="/notices" element={<NoticeBoard />} />
        <Route path="/canvas-test" element={<CanvasTest />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
