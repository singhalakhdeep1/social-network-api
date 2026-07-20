import './globals.css';

export const metadata = {
    title: 'Social Network',
    description: 'Social media platform with GraphQL',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
