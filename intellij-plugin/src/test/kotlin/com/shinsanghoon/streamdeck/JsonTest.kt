package com.shinsanghoon.streamdeck

import kotlin.test.Test
import kotlin.test.assertEquals

class JsonTest {
    @Test
    fun escapesStrings() {
        assertEquals(
            """"slash\\quote\"newline\ncarriage\rtab\t"""",
            Json.string("slash\\quote\"newline\ncarriage\rtab\t"),
        )
    }

    @Test
    fun serializesObjectsWithPreEncodedValues() {
        assertEquals(
            """{"name":"api","ok":true}""",
            Json.obj(mapOf("name" to Json.string("api"), "ok" to "true")),
        )
    }
}
