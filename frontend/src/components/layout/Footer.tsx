export default function Footer() {
  return (
    <footer className="bg-gray-200 text-gray-700 py-4 px-6 mt-auto">
      <div className="container mx-auto flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span>Mistrz zasobów Biblioteki PŁ</span>
          <span className="text-gray-400">|</span>
          <a href="#" className="hover:text-primary">Kontakt</a>
          <span className="text-gray-400">|</span>
          <a href="#" className="hover:text-primary">Regulamin</a>
          <span className="text-gray-400">|</span>
          <a href="#" className="hover:text-primary">Polityka prywatności</a>
        </div>
        <div className="text-gray-500">
          © 2025 Politechnika Łódzka
        </div>
      </div>
    </footer>
  );
}
