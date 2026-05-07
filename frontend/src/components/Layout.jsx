import React from 'react'
import Navbar from './Navbar'
import { Outlet } from 'react-router-dom'
import { Fragment } from 'react'
import { Toaster } from './ui/sonner'
import Footer from './Footer'
import ScrollToTop from './ScrollToTop'
import ChatWidget from './ChatWidget'

const Layout = () => {
    return (
        <div className='min-h-screen flex flex-col overflow-x-hidden w-full relative'>
            {/* Scroll to top on route change */}
            <ScrollToTop />
            {/* Animated background from feat2911 */}
            <div className="global-animated-bg animated-gradient" aria-hidden="true" />
            <Navbar />
            
            <main className='flex-1 w-full relative z-10 pt-[73px] md:pt-[80px]'>
                <Outlet />
            </main>
            
            <Footer />
            <Toaster />
            <ChatWidget />
        </div>
    )
}

export default Layout
