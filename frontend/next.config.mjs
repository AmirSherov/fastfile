/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://fastfile.onrender.com/api/:path*'
      }
    ];
  },
  sassOptions: {
    includePaths: ['./app/styles'],
  },
};

export default nextConfig;
