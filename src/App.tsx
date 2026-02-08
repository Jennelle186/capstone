import Footer from "./components/common/Footer";
import Header from "./components/common/Header";
import LoginPage from "./pages/LoginPage";
import { Toaster } from "./components/ui/sonner";

export function App() {
    return <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
            <LoginPage />
        </main>
        <Toaster />
        <Footer />
    </div>;
}

export default App;