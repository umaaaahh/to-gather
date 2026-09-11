import { BrowserRouter, Routes, Route } from "react-router-dom";
import StreetScene from "./pages/StreetScene";
import DrawZone from "./pages/DrawZone";
import NoticeBoard from "./pages/NoticeBoard";
import CanvasTest from "./pages/CanvasTest";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StreetScene />} />
        <Route path="/draw/:zoneId" element={<DrawZone />} />
        <Route path="/notices" element={<NoticeBoard />} />
        <Route path="/canvas-test" element={<CanvasTest />} />
      </Routes>
    </BrowserRouter>
  );
}
